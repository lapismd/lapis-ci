import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const packageName = "@lapis-notes/lapis-plugin-tasks";
const canonical = "spec/src/plugins/tasks/index.md";
const maintenance = ".changeset/tasks-registry-readiness.md";
const mutable = [
  "package.json",
  "manifest.json",
  "pnpm-lock.yaml",
  canonical,
  maintenance,
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const withoutVersion = ({ version, ...rest }) => rest;
export function validateTasksRecipeCase(example) {
  if (example.outputContract === undefined) return false;
  assert.equal(
    example.outputContract,
    "tasks-coordinated-v1",
    "Unknown output contract",
  );
  assert.equal(example.repository, "lapismd/lapis-plugin-tasks");
  assert.equal(example.profile, undefined);
  assert.equal(example.qualification.cliVersion, "3.0.3");
  assert.equal(example.qualification.packageManager, "pnpm@10.34.5");
  assert.equal(example.qualification.nodeMajor ?? 24, 24);
  assert.equal(
    example.qualification.scripts["release:version"],
    "node scripts/release.mjs version",
  );
  assert.equal(example.ignorePnpmfile, true);
  assert.equal(example.sourceSha, example.closureEvidence?.currentSourceSha);
  assert.equal(example.closureEvidence.comparison, "exact-current-tuple");
  assert.deepEqual(
    example.closureEvidence.sourceHashes,
    example.closureEvidence.currentHashes,
  );
  assert.equal(
    example.qualification.configSha256,
    example.closureEvidence.sourceHashes[".changeset/config.json"],
  );
  assert.deepEqual(example.afterVersionChecks ?? [], []);
  assert.deepEqual(
    Object.keys(example.qualification.files).sort(),
    [
      "pnpm-workspace.yaml",
      "scripts/release.mjs",
      "scripts/release-sigstore.mjs",
      "scripts/release-install-readiness.mjs",
    ].sort(),
  );
  for (const [file, value] of Object.entries(example.qualification.files))
    assert.equal(value, example.closureEvidence.sourceHashes[file]);
  assert.equal(example.expectedReleases?.length, 1);
  const release = example.expectedReleases[0];
  assert.deepEqual(
    Object.keys(release).sort(),
    ["name", "oldVersion", "newVersion"].sort(),
  );
  assert.equal(release.name, packageName);
  assert(
    /^\d+\.\d+\.\d+$/.test(release.oldVersion) &&
      /^\d+\.\d+\.\d+$/.test(release.newVersion),
  );
  const old = release.oldVersion.split(".").map(Number),
    next = release.newVersion.split(".").map(Number);
  assert.deepEqual(
    next,
    [old[0], old[1], old[2] + 1],
    "Tasks proof must prepare one patch",
  );
  return true;
}
export function assertTasksRecipePlan(example, releases) {
  if (!validateTasksRecipeCase(example)) return;
  assert.deepEqual(
    releases.map(({ name, oldVersion, newVersion }) => ({
      name,
      oldVersion,
      newVersion,
    })),
    example.expectedReleases,
    "Tasks version plan differs from the reviewed patch",
  );
}
export async function snapshotTasksRecipe(root, example, releases, parseYaml) {
  assertTasksRecipePlan(example, releases);
  assert(validateTasksRecipeCase(example));
  parseYaml ??= createRequire(path.join(root, "package.json"))("yaml").parse;
  const read = (file) => readFile(path.join(root, file), "utf8");
  const stable = {};
  for (const file of Object.keys(example.closureEvidence.sourceHashes).filter(
    (p) => !mutable.includes(p),
  ))
    stable[file] = hash(await read(file));
  const result = {
    package: JSON.parse(await read("package.json")),
    manifest: JSON.parse(await read("manifest.json")),
    lock: parseYaml(await read("pnpm-lock.yaml")),
    canonical: await read(canonical),
    changelog: await read("CHANGELOG.md"),
    maintenance: await read(maintenance).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    }),
    stable,
  };
  assert.equal(result.package.name, packageName);
  assert.equal(result.manifest.id, "tasks");
  assert.equal(result.manifest.distribution, "first-party-external");
  assert(
    result.maintenance === null || result.maintenance.startsWith("---\n---\n"),
    "Current maintenance note must not create release intent",
  );
  return result;
}
export async function verifyTasksRecipeOutputs(
  root,
  example,
  releases,
  before,
  changes,
  untracked,
  parseYaml,
) {
  const after = await snapshotTasksRecipe(root, example, releases, parseYaml);
  const release = example.expectedReleases[0];
  for (const key of ["package", "manifest"]) {
    assert.equal(before[key].version, release.oldVersion);
    assert.equal(after[key].version, release.newVersion);
    assert.deepEqual(
      withoutVersion(after[key]),
      withoutVersion(before[key]),
      `Tasks ${key} changed beyond its version`,
    );
  }
  assert.deepEqual(
    after.lock,
    before.lock,
    "Tasks lock graph changed during version preparation",
  );
  const marker = (version) =>
    `Release package and runtime manifest version: \`${version}\`.`;
  assert.equal(before.canonical.split(marker(release.oldVersion)).length, 2);
  assert.equal(
    after.canonical,
    before.canonical.replace(
      marker(release.oldVersion),
      marker(release.newVersion),
    ),
    "Tasks canonical evidence changed beyond the version marker",
  );
  assert.notEqual(after.changelog, before.changelog);
  assert(
    after.changelog.split("\n").includes(`## ${release.newVersion}`),
    "Missing prepared Tasks changelog version",
  );
  assert.deepEqual(
    after.stable,
    before.stable,
    "Tasks bound source/configuration changed",
  );
  assert(
    after.maintenance === null || after.maintenance === before.maintenance,
    "Maintenance note changed instead of remaining or being consumed",
  );
  const allowed = new Set([...mutable, "CHANGELOG.md", example.pending.path]);
  assert(
    changes.every((file) => allowed.has(file)),
    "Tasks recipe changed an unreviewed path",
  );
  assert.deepEqual(untracked, [], "Tasks recipe created unreviewed files");
  return {
    packageVersion: after.package.version,
    manifestVersion: after.manifest.version,
    lockGraphUnchanged: true,
    canonicalVersionOnly: true,
    stable: after.stable,
    changedPaths: changes,
  };
}
