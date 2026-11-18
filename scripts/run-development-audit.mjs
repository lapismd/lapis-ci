#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  writeFile,
  appendFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateDevelopmentAudit,
  parseAuditEvidence,
  validateDevelopmentPolicy,
} from "./development-audit.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const defaultRun = (command, args, root) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw Error("Audit subprocess unavailable");
  return { status: result.status, stdout: result.stdout };
};
async function inside(root, relative) {
  if (
    typeof relative !== "string" ||
    path.isAbsolute(relative) ||
    relative
      .split(/[\\/]/)
      .some((part) => !part || part === "." || part === "..")
  )
    throw Error("Expected source-owned relative file");
  const file = await realpath(path.join(root, relative));
  if (!file.startsWith(root + path.sep))
    throw Error("Source file escaped checkout");
  return file;
}

/** Executes only read-only audit/metadata commands; never installs or changes source. */
export async function runDevelopmentAudit({
  root,
  policyFile,
  run = defaultRun,
  fetcher = fetch,
  now,
  clock = () => new Date().toISOString(),
  nodeVersion = process.versions.node,
  repository = process.env.GITHUB_REPOSITORY,
}) {
  let full, production, sourceSha, manifestSha256, lockSha256;
  try {
    root = await realpath(root);
    if (Number(nodeVersion.split(".")[0]) !== 24)
      throw Error("Node24 is required");
    const checked = (command, args) => {
      const result = run(command, args, root);
      if (result.status !== 0) throw Error("Source metadata unavailable");
      return result.stdout.trim();
    };
    if (
      (await realpath(checked("git", ["rev-parse", "--show-toplevel"]))) !==
      root
    )
      throw Error("Audit root must be the repository root");
    const sourceFiles = [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ];
    const dependencySource = () =>
      checked("git", ["log", "-1", "--format=%H", "--", ...sourceFiles]);
    const requireCleanGraph = () => {
      checked("git", ["diff", "--exit-code", "HEAD", "--", ...sourceFiles]);
      if (
        checked("git", [
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
          "--ignored",
          "--",
          ...sourceFiles,
        ])
      )
        throw Error("Uncommitted dependency input");
    };
    sourceSha = dependencySource();
    requireCleanGraph();
    const manifestBytes = await readFile(await inside(root, "package.json")),
      lockBytes = await readFile(await inside(root, "pnpm-lock.yaml"));
    const manifest = JSON.parse(manifestBytes);
    manifestSha256 = hash(manifestBytes);
    lockSha256 = hash(lockBytes);
    const sourceRepository =
      /^git\+https:\/\/github\.com\/(lapismd\/[a-z0-9-]+)\.git$/.exec(
        manifest.repository?.url ?? manifest.repository ?? "",
      )?.[1];
    if (!sourceRepository || (repository && sourceRepository !== repository))
      throw Error("Repository context differs from source declaration");
    repository ??= sourceRepository;
    const manager =
      /^pnpm@(\d+\.\d+\.\d+)(?:\+sha(?:256|512)\.[a-f0-9]+)?$/.exec(
        manifest.packageManager ?? "",
      )?.[1];
    if (!manager || checked("pnpm", ["--version"]) !== manager)
      throw Error("Use the source-owned exact package manager");
    const policyBytes = await readFile(await inside(root, policyFile));
    const policy = validateDevelopmentPolicy(JSON.parse(policyBytes));
    const recordHashes = new Map();
    for (const entry of policy.approvals)
      recordHashes.set(
        entry.record,
        hash(await readFile(await inside(root, entry.record))),
      );
    const audit = (args) => {
      const result = run("pnpm", args, root);
      if (![0, 1].includes(result.status))
        throw Error("Audit command unavailable");
      const evidence = JSON.parse(result.stdout),
        findings = parseAuditEvidence(evidence);
      if (result.status !== (findings.length ? 1 : 0))
        throw Error("Audit exit/count disagreement");
      return { evidence, raw: result.stdout, exitCode: result.status };
    };
    full = audit(["audit", "--json"]);
    production = audit(["audit", "--prod", "--json"]);
    const registry = Object.create(null);
    const findings = parseAuditEvidence(full.evidence);
    const active = policy.approvals.filter((entry) =>
      findings.some((finding) =>
        ["advisory", "package", "version", "path", "severity"].every(
          (key) => entry[key] === finding[key],
        ),
      ),
    );
    for (const pkg of new Set(active.map((entry) => entry.package))) {
      const response = await fetcher(
        `https://registry.npmjs.org/${encodeURIComponent(pkg)}`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw Error("Fix metadata unavailable");
      registry[pkg] = await response.json();
    }
    requireCleanGraph();
    if (
      dependencySource() !== sourceSha ||
      hash(await readFile(await inside(root, "package.json"))) !==
        manifestSha256 ||
      hash(await readFile(await inside(root, "pnpm-lock.yaml"))) !==
        lockSha256 ||
      hash(await readFile(await inside(root, policyFile))) !== hash(policyBytes)
    )
      throw Error("Audit source or approval changed during collection");
    for (const [record, expected] of recordHashes)
      if (hash(await readFile(await inside(root, record))) !== expected)
        throw Error("Audit decision record changed during collection");
    const decision = evaluateDevelopmentAudit({
      full: full.evidence,
      production: production.evidence,
      policy,
      context: {
        repository,
        sourceSha,
        manifestSha256,
        lockSha256,
        manifest,
        now: now ?? clock(),
        registry,
      },
    });
    return {
      decision: {
        ...decision,
        rawFullExitCode: full.exitCode,
        rawProductionExitCode: production.exitCode,
      },
      full,
      production,
    };
  } catch {
    return {
      decision: {
        schemaVersion: 1,
        allowed: false,
        status: "blocked",
        reason: "source-audit-or-fix-evidence-unavailable",
        ...(/^[a-f0-9]{40}$/.test(sourceSha ?? "") ? { sourceSha } : {}),
        ...(manifestSha256 ? { manifestSha256 } : {}),
        ...(lockSha256 ? { lockSha256 } : {}),
      },
      ...(full ? { full } : {}),
      ...(production ? { production } : {}),
    };
  }
}

if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() => null)) ===
    fileURLToPath(import.meta.url)
) {
  const root = path.resolve(
    process.env.GITHUB_WORKSPACE ?? process.cwd(),
    process.env.LAPIS_AUDIT_WORKING_DIRECTORY ?? ".",
  );
  const result = await runDevelopmentAudit({
    root,
    policyFile: process.env.LAPIS_AUDIT_POLICY_FILE,
  });
  const directory = path.resolve(
    root,
    process.env.LAPIS_AUDIT_REPORT_DIRECTORY ?? ".local/dependency-audit",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "decision.json"),
    JSON.stringify(result.decision, null, 2) + "\n",
  );
  // Preserve only successfully parsed raw audits, never registry/API bodies or
  // arbitrary subprocess error output that might include private configuration.
  for (const name of ["full", "production"])
    if (result[name])
      await writeFile(
        path.join(directory, `${name}-audit.json`),
        result[name].raw,
      );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `allowed=${result.decision.allowed}\nstatus=${result.decision.status}\n`,
    );
  console.log(JSON.stringify(result.decision));
  process.exitCode = result.decision.allowed ? 0 : 1;
}
