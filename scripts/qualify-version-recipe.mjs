import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { guardVersioningInputs } from "./versioning-runtime.mjs";
import {
  establishFixtureBaseline,
  restoreHistoricalFixtureNote,
} from "./version-recipe-fixture.mjs";
import {
  discoverRecipeManifests,
  selectRecipeCase,
} from "./version-recipe-layout.mjs";
import { verifyVersionOutputs } from "./version-recipe-outputs.mjs";
import {
  aiRecipeEnvironment,
  bootstrapAiRecipe,
  verifyAiRecipeTools,
} from "./ai-version-recipe.mjs";
import {
  snapshotAiRecipeOutputs,
  verifyAiRecipeOutputs,
} from "./ai-version-recipe-outputs.mjs";

const root = path.resolve(process.argv[2] ?? "");
if (!process.argv[2])
  throw Error("Provide the immutable consumer source checkout");
const cases = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const caseName = process.env.RECIPE_CASE ?? "plugins-changesets2";
const example = selectRecipeCase(cases, caseName);
const aiProfile = example.profile === "ai-node22-rust-offline";
const contracts = JSON.parse(
  await readFile(
    new URL("../changesets-runtime.json", import.meta.url),
    "utf8",
  ),
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const output = path.resolve(
  process.env.GITHUB_WORKSPACE ?? process.cwd(),
  "reports/version-recipe-qualification.json",
);
const receipt = {
  schemaVersion: 1,
  case: caseName,
  repository: example.repository,
  sourceSha: example.sourceSha,
  node: process.versions.node,
  published: false,
  writerAppMinted: false,
  status: "started",
};
await mkdir(path.dirname(output), { recursive: true });
const save = () => writeFile(output, JSON.stringify(receipt, null, 2) + "\n");
await save();
function readGit(args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function run(args, env) {
  if (args[0] === "install") receipt.installArgs = [...args];
  const result = spawnSync("pnpm", args, { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) throw Error("Recipe subprocess failed");
}
try {
  assert.equal(
    Number(process.versions.node.split(".")[0]),
    example.qualification.nodeMajor ?? 24,
  );
  assert.equal(readGit(["rev-parse", "HEAD"]), example.sourceSha);
  assert.equal(readGit(["status", "--porcelain", "--untracked-files=no"]), "");
  if (example.historicalNoteSourceSha) {
    receipt.validationInput = await restoreHistoricalFixtureNote(
      root,
      example.sourceSha,
      {
        ...example.pending,
        sourceSha: example.historicalNoteSourceSha,
      },
    );
  } else
    receipt.validationInput = {
      kind: "genuine-pending-source",
      currentReleaseIntent: true,
    };
  receipt.sourceHashes = {};
  for (const file of example.closureEvidence
    ? Object.keys(example.closureEvidence.sourceHashes)
    : [
        "package.json",
        "pnpm-lock.yaml",
        ".changeset/config.json",
        ...Object.keys(example.qualification.files),
      ]) {
    const hash = sha256(await readFile(path.join(root, file)));
    if (example.closureEvidence)
      assert.equal(hash, example.closureEvidence.sourceHashes[file]);
    receipt.sourceHashes[file] = hash;
  }
  assert.equal(
    sha256(await readFile(path.join(root, example.pending.path))),
    example.pending.sha256,
  );
  receipt.pending = example.pending;
  receipt.fixtureBaseline = await establishFixtureBaseline(
    root,
    example.sourceSha,
  );
  await save();
  // Fresh exact install; never change source configuration or dependency recipes.
  const setupEnv = aiProfile ? aiRecipeEnvironment(process.env) : process.env;
  const nativeTools = aiProfile
    ? await verifyAiRecipeTools(root, example, setupEnv)
    : null;
  if (aiProfile) {
    receipt.nativeTools = nativeTools.receipt;
    await save();
  }
  if (aiProfile)
    run(["install", "--frozen-lockfile", "--ignore-pnpmfile"], setupEnv);
  else
    run(
      [
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        ...(example.strictPeerDependencies
          ? ["--strict-peer-dependencies"]
          : []),
        ...(example.ignorePnpmfile ? ["--ignore-pnpmfile"] : []),
      ],
      setupEnv,
    );
  const local = path.join(root, ".local");
  await mkdir(local, { recursive: true });
  const sandbox = await mkdtemp(path.join(local, "node-versioning-proof-")),
    bin = path.join(sandbox, "bin");
  await mkdir(bin);
  for (const name of [
    "node",
    "pnpm",
    "git",
    "sh",
    "bash",
    "sed",
    "dirname",
    "uname",
    ...(aiProfile ? ["cargo", "rustc"] : []),
  ]) {
    const actual =
      nativeTools?.paths[name] ??
      (name === "node"
        ? process.execPath
        : execFileSync("which", [name], { encoding: "utf8" }).trim());
    await symlink(await realpath(actual), path.join(bin, name));
  }
  const env = {
    ...setupEnv,
    PATH: bin,
    ...(aiProfile ? {} : { LAPIS_PLUGINS_VALIDATION_RUNTIME: "native" }),
  };
  assert.equal(spawnSync("deno", ["--version"], { env }).error?.code, "ENOENT");
  receipt.denoOnPath = false;
  const guard = await guardVersioningInputs(
    root,
    example.qualification,
    contracts,
  );
  receipt.cliVersion = guard.version;
  if (aiProfile) {
    receipt.bootstrap = bootstrapAiRecipe(root, env);
  }
  const statusFile = path.join(sandbox, "status.json");
  run(["exec", "changeset", "status", "--output", statusFile], env);
  const status = JSON.parse(await readFile(statusFile, "utf8"));
  assert(
    status.releases.length > 0,
    "The genuine pending note must prepare an actual version mutation",
  );
  const manifests = await discoverRecipeManifests(root);
  const changes = [];
  for (const release of status.releases) {
    const pkg = manifests.find((p) => p.name === release.name);
    assert(pkg, "Every planned release must have its real source manifest");
    changes.push({
      name: pkg.name,
      oldVersion: pkg.oldVersion,
      newVersion: release.newVersion,
      changelogBefore: await readFile(pkg.changelog)
        .then(sha256)
        .catch((error) => {
          if (error.code === "ENOENT") return null;
          throw error;
        }),
    });
  }
  receipt.status = "qualified-inputs";
  receipt.releases = changes;
  receipt.versionOutputsBefore = await verifyVersionOutputs(
    root,
    example.versionOutputs ?? [],
    changes,
    "before",
  );
  if (aiProfile)
    receipt.nativeOutputsBefore = await snapshotAiRecipeOutputs(
      root,
      example,
      changes,
    );
  await save();
  // This is the unchanged real command, including source metadata sync and
  // the actual Bases compatibility/provenance tests owned by the consumer.
  run(["release:version"], env);
  for (const args of example.afterVersionChecks ?? []) run(args, env);
  if (aiProfile)
    receipt.nativeOutputsAfter = await verifyAiRecipeOutputs(
      root,
      example,
      changes,
      receipt.nativeOutputsBefore,
      readGit(["diff", "--name-only"]).split("\n").filter(Boolean),
      readGit(["ls-files", "--others", "--exclude-standard"])
        .split("\n")
        .filter(Boolean),
    );
  receipt.versionOutputsAfter = await verifyVersionOutputs(
    root,
    example.versionOutputs ?? [],
    changes,
    "after",
  );
  for (const change of changes) {
    const pkg = manifests.find((p) => p.name === change.name);
    assert.equal(
      JSON.parse(await readFile(pkg.file, "utf8")).version,
      change.newVersion,
    );
    assert.notEqual(
      sha256(await readFile(pkg.changelog)),
      change.changelogBefore,
    );
  }
  await assert.rejects(access(path.join(root, example.pending.path)), {
    code: "ENOENT",
  });
  assert.equal(spawnSync("deno", ["--version"], { env }).error?.code, "ENOENT");
  receipt.status = "passed";
  receipt.completedAt = new Date().toISOString();
  receipt.command = "pnpm release:version";
  receipt.recipeQualification = aiProfile
    ? "current-source-historical-validation-input-node22-rust-offline-no-deno"
    : example.historicalNoteSourceSha
      ? "current-source-historical-validation-input-node24-no-deno"
      : "actual-source-node24-no-deno";
  receipt.inputBindings = example.qualification;
  receipt.sourceChanges = readGit(["diff", "--name-only"]).split("\n");
  await save();
  console.log(
    aiProfile
      ? "Actual AI Node22/Rust offline version recipe passed with Deno absent; nothing published."
      : "Actual source-owned version/status/changelog recipe passed on Node24 with Deno absent; nothing published.",
  );
} catch (error) {
  receipt.status = "failed";
  receipt.reason =
    "Immutable source, frozen install, runtime guard or unchanged whole recipe did not qualify";
  await save();
  throw error;
}
