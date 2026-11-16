import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { guardVersioningInputs } from "./versioning-runtime.mjs";

const root = path.resolve(process.argv[2] ?? "");
if (!process.argv[2])
  throw Error("Provide the immutable Plugins source checkout");
const cases = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const example = cases.cases["plugins-changesets2"];
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
  case: "plugins-changesets2",
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
  const result = spawnSync("pnpm", args, { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) throw Error("Recipe subprocess failed");
}
try {
  assert.equal(Number(process.versions.node.split(".")[0]), 24);
  assert.equal(readGit(["rev-parse", "HEAD"]), example.sourceSha);
  assert.equal(readGit(["status", "--porcelain", "--untracked-files=no"]), "");
  assert.equal(
    sha256(await readFile(path.join(root, example.pending.path))),
    example.pending.sha256,
  );
  receipt.pending = example.pending;
  // Fresh exact install; never change source configuration or dependency recipes.
  run(["install", "--frozen-lockfile", "--ignore-scripts"], process.env);
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
  ]) {
    const actual =
      name === "node"
        ? process.execPath
        : execFileSync("which", [name], { encoding: "utf8" }).trim();
    await symlink(await realpath(actual), path.join(bin, name));
  }
  const env = {
    ...process.env,
    PATH: bin,
    LAPIS_PLUGINS_VALIDATION_RUNTIME: "native",
  };
  assert.equal(spawnSync("deno", ["--version"], { env }).error?.code, "ENOENT");
  receipt.denoOnPath = false;
  const guard = await guardVersioningInputs(
    root,
    example.qualification,
    contracts,
  );
  receipt.cliVersion = guard.version;
  const statusFile = path.join(sandbox, "status.json");
  run(["exec", "changeset", "status", "--output", statusFile], env);
  const status = JSON.parse(await readFile(statusFile, "utf8"));
  assert(
    status.releases.length > 0,
    "The genuine pending note must prepare an actual version mutation",
  );
  const manifests = [];
  for (const entry of await readdir(path.join(root, "packages"), {
    withFileTypes: true,
  }))
    if (entry.isDirectory()) {
      const file = path.join(root, "packages", entry.name, "package.json");
      try {
        const pkg = JSON.parse(await readFile(file, "utf8"));
        manifests.push({
          name: pkg.name,
          file,
          oldVersion: pkg.version,
          changelog: path.join(path.dirname(file), "CHANGELOG.md"),
        });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
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
  await save();
  // This is the unchanged real command, including source metadata sync and
  // the actual Bases compatibility/provenance tests owned by the consumer.
  run(["release:version"], env);
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
  receipt.recipeQualification = "actual-source-node24-no-deno";
  receipt.inputBindings = example.qualification;
  receipt.sourceChanges = readGit(["diff", "--name-only"]).split("\n");
  await save();
  console.log(
    "Actual source-owned Plugins version/status/changelog/metadata/Bases recipe passed on Node24 with Deno absent; nothing published.",
  );
} catch (error) {
  receipt.status = "failed";
  receipt.reason =
    "Immutable source, frozen install, runtime guard or unchanged whole recipe did not qualify";
  await save();
  throw error;
}
