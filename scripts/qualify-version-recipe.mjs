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
import { verifyDirectRecipeOutputs } from "./direct-version-recipe-outputs.mjs";
import { guardVersioningInputs } from "./versioning-runtime.mjs";
import {
  versionRecipeCommand,
  assertDirectRecipePlan,
} from "./version-recipe-command.mjs";
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
  assertPluginRecipePlan,
  snapshotPluginRecipe,
  verifyPluginRecipeOutputs,
} from "./plugin-version-recipe-outputs.mjs";
import {
  snapshotTasksRecipe,
  verifyTasksRecipeOutputs,
} from "./tasks-version-recipe-outputs.mjs";
import {
  aiRecipeEnvironment,
  bootstrapAiRecipe,
  verifyAiRecipeTools,
} from "./ai-version-recipe.mjs";
import {
  snapshotAiRecipeOutputs,
  verifyAiRecipeOutputs,
} from "./ai-version-recipe-outputs.mjs";

import {
  terminalRecipeEnvironment,
  bootstrapTerminalRecipe,
  verifyTerminalRecipeTools,
} from "./terminal-version-recipe.mjs";
import {
  assertTerminalRecipePlan,
  terminalPreparedVersions,
} from "./terminal-version-recipe-plan.mjs";
import {
  snapshotTerminalRecipeOutputs,
  verifyTerminalRecipeOutputs,
} from "./terminal-version-recipe-outputs.mjs";
import {
  COREPACK_RECIPE_PROFILE,
  corepackRecipeEnvironment,
  verifyCorepackRecipeTools,
} from "./corepack-version-recipe.mjs";
import {
  assertCorepackRecipePlan,
  snapshotCorepackRecipeOutputs,
  verifyCorepackRecipeOutputs,
} from "./corepack-version-recipe-outputs.mjs";

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
const versionCommand = versionRecipeCommand(example.qualification);
const aiProfile = example.profile === "ai-node22-rust-offline";
const terminalProfile = example.profile === "terminal-node24-rust-offline";
const nativeProfile = aiProfile || terminalProfile;
const corepackProfile = example.profile === COREPACK_RECIPE_PROFILE;
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
  const setupEnv = aiProfile
    ? aiRecipeEnvironment(process.env)
    : terminalProfile
      ? terminalRecipeEnvironment(process.env)
      : corepackProfile
        ? corepackRecipeEnvironment(process.env)
        : process.env;
  const nativeTools = aiProfile
    ? await verifyAiRecipeTools(root, example, setupEnv)
    : terminalProfile
      ? await verifyTerminalRecipeTools(root, example, setupEnv)
      : null;
  if (nativeProfile) {
    receipt.nativeTools = nativeTools.receipt;
    await save();
  }
  const corepackTools = corepackProfile
    ? await verifyCorepackRecipeTools(root, example, setupEnv)
    : null;
  if (corepackProfile) {
    receipt.runtimeTools = corepackTools.receipt;
    await save();
  }
  if (nativeProfile)
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
    ...(nativeProfile ? ["cargo", "rustc"] : []),
    ...(corepackProfile ? ["corepack"] : []),
  ]) {
    const actual =
      nativeTools?.paths[name] ??
      corepackTools?.paths[name] ??
      (name === "node"
        ? process.execPath
        : execFileSync("which", [name], { encoding: "utf8" }).trim());
    await symlink(await realpath(actual), path.join(bin, name));
  }
  const env = {
    ...setupEnv,
    PATH: bin,
    ...(nativeProfile ? {} : { LAPIS_PLUGINS_VALIDATION_RUNTIME: "native" }),
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
  } else if (terminalProfile)
    receipt.bootstrap = bootstrapTerminalRecipe(root, env);
  const statusFile = path.join(sandbox, "status.json");
  run(["exec", "changeset", "status", "--output", statusFile], env);
  const status = JSON.parse(await readFile(statusFile, "utf8"));
  assert(
    status.releases.length > 0,
    "The genuine pending note must prepare an actual version mutation",
  );
  if (terminalProfile) assertTerminalRecipePlan(example, status.releases);
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
  const preparedReleases = terminalProfile
    ? terminalPreparedVersions(example, changes)
    : changes;
  if (terminalProfile) receipt.preparedReleases = preparedReleases;
  assertDirectRecipePlan(example, changes);
  assertPluginRecipePlan(example, changes);
  if (corepackProfile) {
    assertCorepackRecipePlan(example, changes);
    receipt.corepackOutputsBefore = await snapshotCorepackRecipeOutputs(
      root,
      example,
      changes,
    );
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
  if (terminalProfile)
    receipt.terminalOutputsBefore = await snapshotTerminalRecipeOutputs(
      root,
      example,
      changes,
    );
  if (example.outputContract === "tasks-coordinated-v1")
    receipt.tasksOutputsBefore = await snapshotTasksRecipe(
      root,
      example,
      changes,
    );
  if (example.outputContract === "docs-coordinated-v1")
    receipt.docsOutputsBefore = await snapshotPluginRecipe(
      root,
      example,
      changes,
    );
  await save();
  // This is the unchanged real command, including source metadata sync and
  // the actual Bases compatibility/provenance tests owned by the consumer.
  if (example.qualification.mode === "direct") run(versionCommand, env);
  else run(["release:version"], env);
  for (const args of example.afterVersionChecks ?? []) run(args, env);
  if (corepackProfile) {
    receipt.corepackOutputsAfter = await verifyCorepackRecipeOutputs(
      root,
      example,
      changes,
      receipt.corepackOutputsBefore,
      readGit(["diff", "--name-only"]).split("\n").filter(Boolean),
      readGit(["ls-files", "--others", "--exclude-standard"])
        .split("\n")
        .filter(Boolean),
    );
    await guardVersioningInputs(root, example.qualification, contracts);
    await verifyCorepackRecipeTools(root, example, setupEnv);
  }
  if (example.outputContract === "docs-coordinated-v1")
    receipt.docsOutputsAfter = await verifyPluginRecipeOutputs(
      root,
      example,
      changes,
      receipt.docsOutputsBefore,
      readGit(["diff", "--name-only"]).split("\n").filter(Boolean),
      readGit(["ls-files", "--others", "--exclude-standard"])
        .split("\n")
        .filter(Boolean),
    );
  if (example.outputContract === "tasks-coordinated-v1")
    receipt.tasksOutputsAfter = await verifyTasksRecipeOutputs(
      root,
      example,
      changes,
      receipt.tasksOutputsBefore,
      readGit(["diff", "--name-only"]).split("\n").filter(Boolean),
      readGit(["ls-files", "--others", "--exclude-standard"])
        .split("\n")
        .filter(Boolean),
    );
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
  if (terminalProfile)
    receipt.terminalOutputsAfter = await verifyTerminalRecipeOutputs(
      root,
      example,
      changes,
      receipt.terminalOutputsBefore,
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
  for (const change of preparedReleases) {
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
  if (example.qualification.mode === "direct")
    receipt.directPackageVersions = await verifyDirectRecipeOutputs(
      root,
      example,
      manifests,
      changes,
      readGit(["diff", "--name-only"]).split("\n").filter(Boolean),
      readGit(["ls-files", "--others", "--exclude-standard"])
        .split("\n")
        .filter(Boolean),
    );
  receipt.status = "passed";
  receipt.completedAt = new Date().toISOString();
  receipt.command = `pnpm ${versionCommand.join(" ")}`;
  receipt.recipeQualification = aiProfile
    ? "current-source-historical-validation-input-node22-rust-offline-no-deno"
    : terminalProfile
      ? "current-source-historical-validation-input-node24-rust-offline-no-deno"
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
