import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const marker = "Release package and runtime manifest version: `{{version}}`.";
const contracts = {
  "tasks-coordinated-v1": {
    id: "tasks",
    packageManager: "pnpm@10.34.5",
    increment: "patch",
    files: [
      "pnpm-workspace.yaml",
      "scripts/release.mjs",
      "scripts/release-sigstore.mjs",
      "scripts/release-install-readiness.mjs",
    ],
    texts: [{ path: "spec/src/plugins/tasks/index.md", marker }],
  },
  "docs-coordinated-v1": {
    id: "docs",
    packageManager: "pnpm@10.32.1",
    increment: "minor",
    files: [
      "pnpm-workspace.yaml",
      "scripts/release.mjs",
      "scripts/release-install-readiness.mjs",
    ],
    texts: [
      { path: "spec/src/plugins/docs/index.md", marker },
      { path: "spec-validator.config.mjs", marker: 'version: "{{version}}"' },
      {
        path: "spec/src/spec-governance.md",
        marker: "Validator package version pin: `{{version}}`.",
      },
      {
        path: "README.md",
        marker:
          "Package version: `@lapis-notes/lapis-plugin-docs@{{version}}`.",
      },
    ],
  },
};
function contract(example) {
  const policy = contracts[example.outputContract];
  assert(policy, "Unknown output contract");
  const packageName = "@lapis-notes/lapis-plugin-" + policy.id;
  const canonical = policy.texts[0].path;
  const maintenance = ".changeset/" + policy.id + "-registry-readiness.md";
  return {
    ...policy,
    packageName,
    canonical,
    maintenance,
    mutable: [
      "package.json",
      "manifest.json",
      "pnpm-lock.yaml",
      ...policy.texts.map((t) => t.path),
      maintenance,
    ],
  };
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const withoutVersion = ({ version, ...rest }) => rest;
export function validatePluginRecipeCase(example) {
  if (example.outputContract === undefined) return false;
  const policy = contract(example),
    { packageName } = policy;
  assert.equal(example.repository, "lapismd/lapis-plugin-" + policy.id);
  assert.equal(
    example.strictPeerDependencies,
    policy.id === "docs" ? true : undefined,
  );
  assert.equal(example.profile, undefined);
  assert.equal(example.qualification.cliVersion, "3.0.3");
  assert.equal(example.qualification.packageManager, policy.packageManager);
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
    [...policy.files].sort(),
  );
  assert.deepEqual(example.versionOutputs, [
    { path: "manifest.json", packageName, kind: "json-version" },
    ...policy.texts.map(({ path, marker }) => ({
      path,
      packageName,
      kind: "text-marker",
      marker,
    })),
  ]);
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
    policy.increment === "patch"
      ? [old[0], old[1], old[2] + 1]
      : [old[0], old[1] + 1, 0],
    "Plugin proof must preserve the reviewed genuine note increment",
  );
  return true;
}
export function assertPluginRecipePlan(example, releases) {
  if (!validatePluginRecipeCase(example)) return;
  assert.deepEqual(
    releases.map(({ name, oldVersion, newVersion }) => ({
      name,
      oldVersion,
      newVersion,
    })),
    example.expectedReleases,
    "Plugin version plan differs from the reviewed release",
  );
}
export async function snapshotPluginRecipe(root, example, releases, parseYaml) {
  assertPluginRecipePlan(example, releases);
  assert(validatePluginRecipeCase(example));
  const { packageName, id, canonical, maintenance, mutable, texts } =
    contract(example);
  parseYaml ??= createRequire(path.join(root, "package.json"))("yaml").parse;
  const read = (file) => readFile(path.join(root, file), "utf8");
  const stable = {};
  for (const file of Object.keys(example.closureEvidence.sourceHashes).filter(
    (p) => !mutable.includes(p),
  ))
    stable[file] = hash(await read(file));
  const textOutputs = {};
  for (const text of texts) textOutputs[text.path] = await read(text.path);
  const result = {
    package: JSON.parse(await read("package.json")),
    manifest: JSON.parse(await read("manifest.json")),
    lock: parseYaml(await read("pnpm-lock.yaml")),
    canonical: textOutputs[canonical],
    textOutputs,
    changelog: await read("CHANGELOG.md"),
    maintenance: await read(maintenance).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    }),
    stable,
  };
  assert.equal(result.package.name, packageName);
  assert.equal(result.manifest.id, id);
  assert.equal(result.manifest.distribution, "first-party-external");
  assert(
    result.maintenance === null || result.maintenance.startsWith("---\n---\n"),
    "Current maintenance note must not create release intent",
  );
  return result;
}
export async function verifyPluginRecipeOutputs(
  root,
  example,
  releases,
  before,
  changes,
  untracked,
  parseYaml,
) {
  const { mutable, texts } = contract(example);
  const after = await snapshotPluginRecipe(root, example, releases, parseYaml);
  const release = example.expectedReleases[0];
  for (const key of ["package", "manifest"]) {
    assert.equal(before[key].version, release.oldVersion);
    assert.equal(after[key].version, release.newVersion);
    assert.deepEqual(
      withoutVersion(after[key]),
      withoutVersion(before[key]),
      `Plugin ${key} changed beyond its version`,
    );
  }
  assert.deepEqual(
    after.lock,
    before.lock,
    "Plugin lock graph changed during version preparation",
  );
  for (const text of texts) {
    const marker = (version) => text.marker.replace("{{version}}", version);
    assert.equal(
      before.textOutputs[text.path].split(marker(release.oldVersion)).length,
      2,
    );
    assert.equal(
      after.textOutputs[text.path],
      before.textOutputs[text.path].replace(
        marker(release.oldVersion),
        marker(release.newVersion),
      ),
      "Plugin canonical evidence changed beyond the version marker: " +
        text.path,
    );
  }
  assert.notEqual(after.changelog, before.changelog);
  assert(
    after.changelog.split("\n").includes(`## ${release.newVersion}`),
    "Missing prepared Plugin changelog version",
  );
  assert.deepEqual(
    after.stable,
    before.stable,
    "Plugin bound source/configuration changed",
  );
  assert(
    after.maintenance === null || after.maintenance === before.maintenance,
    "Maintenance note changed instead of remaining or being consumed",
  );
  const allowed = new Set([...mutable, "CHANGELOG.md", example.pending.path]);
  assert(
    changes.every((file) => allowed.has(file)),
    "Plugin recipe changed an unreviewed path",
  );
  assert.deepEqual(untracked, [], "Plugin recipe created unreviewed files");
  return {
    packageVersion: after.package.version,
    manifestVersion: after.manifest.version,
    lockGraphUnchanged: true,
    canonicalVersionOnly: true,
    stable: after.stable,
    changedPaths: changes,
  };
}
