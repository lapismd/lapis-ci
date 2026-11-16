import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runDevelopmentAudit } from "./run-development-audit.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const clean = () => ({
  advisories: {},
  muted: [],
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
  },
});
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "lapis-audit-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = JSON.stringify({
    name: "@lapismd/example",
    packageManager: "pnpm@10.32.1",
    repository: { url: "git+https://github.com/lapismd/example.git" },
    devDependencies: { "@sveltejs/vite-plugin-svelte": "5.1.1" },
  });
  await writeFile(path.join(root, "package.json"), manifest);
  await writeFile(path.join(root, "pnpm-lock.yaml"), "reviewed-lock\n");
  await mkdir(path.join(root, "spec/records"), { recursive: true });
  await writeFile(
    path.join(root, "spec/records/decision.md"),
    "Delegated operator record, not a transferred exception.\n",
  );
  const entry = {
    advisory: "GHSA-gcqx-w48m-w2h4",
    package: "deepmerge",
    version: "4.3.1",
    severity: "low",
    path: ".>@sveltejs/vite-plugin-svelte>deepmerge",
    scope: "development-only",
    vulnerableRange: ">=4.2.0 <=4.3.1",
    patchedRange: "<0.0.0",
    sourceSha: "a".repeat(40),
    manifestSha256: digest(manifest),
    lockSha256: digest("reviewed-lock\n"),
    approvedAt: "2026-11-16T00:00:00.000Z",
    expiresAt: "2026-11-21T00:00:00.000Z",
    authority: "delegated-operator",
    record: "spec/records/decision.md",
  };
  await writeFile(
    path.join(root, "policy.json"),
    JSON.stringify({
      schemaVersion: 1,
      repository: "lapismd/example",
      approvals: [entry],
    }),
  );
  const audit = {
    ...clean(),
    advisories: {
      one: {
        github_advisory_id: entry.advisory,
        module_name: "deepmerge",
        severity: "low",
        vulnerable_versions: entry.vulnerableRange,
        patched_versions: "<0.0.0",
        url: "https://github.com/advisories/" + entry.advisory,
        findings: [{ version: "4.3.1", paths: [entry.path] }],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0 },
    },
  };
  const calls = [];
  const run = (command, args, cwd) => {
    calls.push([command, ...args]);
    assert.equal(cwd, root);
    if (command === "git" && args[0] === "rev-parse")
      return { status: 0, stdout: root };
    if (command === "git" && args[0] === "log")
      return { status: 0, stdout: entry.sourceSha };
    if (command === "git" && ["diff", "status"].includes(args[0]))
      return { status: 0, stdout: "" };
    if (command === "pnpm" && args[0] === "--version")
      return { status: 0, stdout: "10.32.1" };
    if (JSON.stringify(args) === JSON.stringify(["audit", "--json"]))
      return { status: 1, stdout: JSON.stringify(audit) };
    if (JSON.stringify(args) === JSON.stringify(["audit", "--prod", "--json"]))
      return { status: 0, stdout: JSON.stringify(clean()) };
    throw Error("Unexpected command must not execute");
  };
  const fetcher = async (url) => {
    assert.equal(url, "https://registry.npmjs.org/deepmerge");
    return {
      ok: true,
      json: async () => ({
        name: "deepmerge",
        versions: { "4.3.1": { version: "4.3.1" } },
      }),
    };
  };
  return {
    root,
    entry,
    calls,
    run,
    fetcher,
    options: {
      root,
      policyFile: "policy.json",
      run,
      fetcher,
      repository: "lapismd/example",
      now: "2026-11-16T04:00:00.000Z",
      nodeVersion: "24.15.0",
    },
  };
}

test("production runner reads committed source, runs both real audit shapes and retains unmodified raw evidence", async (t) => {
  const f = await fixture(t),
    result = await runDevelopmentAudit(f.options);
  assert.equal(result.decision.allowed, true);
  assert.equal(result.decision.rawFullExitCode, 1);
  assert.equal(result.decision.rawProductionExitCode, 0);
  assert.equal(JSON.parse(result.full.raw).metadata.vulnerabilities.low, 1);
  assert.deepEqual(
    f.calls.filter((call) => call[0] === "pnpm"),
    [
      ["pnpm", "--version"],
      ["pnpm", "audit", "--json"],
      ["pnpm", "audit", "--prod", "--json"],
    ],
  );
  assert(
    f.calls.some(
      (call) =>
        call[0] === "git" && call[1] === "diff" && call.includes("HEAD"),
    ),
  );
});

test("runner blocks missing fix metadata, changed package manager, dirty graph and exit/count disagreement", async (t) => {
  const f = await fixture(t);
  for (const run of [
    (cmd, args, root) =>
      args[0] === "--version"
        ? { status: 0, stdout: "10.34.5" }
        : f.run(cmd, args, root),
    (cmd, args, root) =>
      cmd === "git" && args[0] === "diff"
        ? { status: 1, stdout: "private-command-output" }
        : f.run(cmd, args, root),
    (cmd, args, root) =>
      args[0] === "audit" && !args.includes("--prod")
        ? { ...f.run(cmd, args, root), status: 0 }
        : f.run(cmd, args, root),
  ]) {
    const result = await runDevelopmentAudit({ ...f.options, run });
    assert.equal(result.decision.allowed, false);
    assert(!JSON.stringify(result).includes("private-command-output"));
  }
  assert.equal(
    (
      await runDevelopmentAudit({
        ...f.options,
        fetcher: async () => ({ ok: false }),
      })
    ).decision.allowed,
    false,
  );
  assert.equal(
    (await runDevelopmentAudit({ ...f.options, nodeVersion: "26.0.0" }))
      .decision.allowed,
    false,
  );
});

test("shared action wires only the reviewed Node helper and source-owned input data", async () => {
  const action = await readFile(
    new URL("../actions/check-development-audit/action.yml", import.meta.url),
    "utf8",
  );
  assert.match(action, /using: composite/);
  assert.match(action, /run-development-audit\.mjs/);
  assert.match(
    action,
    /LAPIS_AUDIT_POLICY_FILE: \$\{\{ inputs.policy-file \}\}/,
  );
  assert.doesNotMatch(
    action,
    /secrets\.|create-github-app-token|continue-on-error|curl|npm install/,
  );
});

test("resolved finding retires without requiring stale package fix metadata", async (t) => {
  const f = await fixture(t);
  const run = (cmd, args, root) =>
    args[0] === "audit"
      ? { status: 0, stdout: JSON.stringify(clean()) }
      : f.run(cmd, args, root);
  const result = await runDevelopmentAudit({
    ...f.options,
    run,
    fetcher: async () => {
      throw Error("No registry read is required for a retired approval");
    },
  });
  assert.equal(result.decision.allowed, true);
  assert.equal(result.decision.status, "clean");
  assert.equal(result.decision.retired.length, 1);
});

test("runner rejects graph, history or approval changes during audit evidence collection", async (t) => {
  for (const change of [
    "manifest",
    "lock",
    "history",
    "workspace",
    "policy",
    "record",
  ]) {
    const f = await fixture(t);
    let changed = false;
    const result = await runDevelopmentAudit({
      ...f.options,
      run: (command, args, root) => {
        if (
          changed &&
          change === "history" &&
          command === "git" &&
          args[0] === "log"
        )
          return { status: 0, stdout: "b".repeat(40) };
        if (
          changed &&
          change === "workspace" &&
          command === "git" &&
          args[0] === "diff"
        )
          return { status: 1, stdout: "private late workspace diagnostic" };
        return f.run(command, args, root);
      },
      fetcher: async (url) => {
        const response = await f.fetcher(url);
        const files = {
          manifest: "package.json",
          lock: "pnpm-lock.yaml",
          policy: "policy.json",
          record: "spec/records/decision.md",
        };
        if (files[change]) {
          const file = path.join(f.root, files[change]);
          await writeFile(file, (await readFile(file, "utf8")) + "\n");
        }
        changed = true;
        return response;
      },
    });
    assert.equal(result.decision.allowed, false, change);
    assert(
      result.full && result.production,
      "Retain both raw audits on late rejection",
    );
    assert(
      !JSON.stringify(result).includes("private late workspace diagnostic"),
    );
  }
});

test("approval expiry is evaluated after audit collection rather than at entry", async (t) => {
  const f = await fixture(t);
  let currentTime = "2026-11-20T23:59:59.000Z";
  const result = await runDevelopmentAudit({
    ...f.options,
    now: undefined,
    clock: () => currentTime,
    fetcher: async (url) => {
      const response = await f.fetcher(url);
      currentTime = "2026-11-21T00:00:01.000Z";
      return response;
    },
  });
  assert.equal(result.decision.allowed, false);
  assert.equal(result.decision.reason, "approval-expired-or-not-yet-valid");
});

test("untracked or ignored graph input blocks initial and final admission", async (t) => {
  for (const late of [false, true]) {
    const f = await fixture(t);
    let collected = false;
    const result = await runDevelopmentAudit({
      ...f.options,
      run: (command, args, root) =>
        command === "git" && args[0] === "status"
          ? {
              status: 0,
              stdout: !late || collected ? "?? pnpm-workspace.yaml\n" : "",
            }
          : f.run(command, args, root),
      fetcher: async (url) => {
        const response = await f.fetcher(url);
        collected = true;
        return response;
      },
    });
    assert.equal(
      result.decision.allowed,
      false,
      late ? "late graph input" : "initial graph input",
    );
    assert.equal(Boolean(result.full), late);
    assert(!JSON.stringify(result).includes("?? pnpm-workspace.yaml"));
  }
});
