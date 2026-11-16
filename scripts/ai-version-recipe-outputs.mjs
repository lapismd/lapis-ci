import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { canonicalHashes } from "./native-version-recipe-outputs.mjs";
import { validateAiRecipeProfile } from "./ai-version-recipe.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (root, file) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));

/** Independent receipts for native metadata the real source release check also gates. */
export async function snapshotAiRecipeOutputs(
  root,
  example,
  releases,
  parseToml,
) {
  const profile = validateAiRecipeProfile(example);
  assert(profile, "An explicit AI profile is required");
  if (!parseToml) {
    const require = createRequire(
      path.join(await realpath(root), "package.json"),
    );
    parseToml = require("@iarna/toml").parse;
  }
  const toml = async (file) =>
    parseToml(await readFile(path.join(root, file), "utf8"));
  const release = releases.find((item) => item.name === "@lapismd/lapis-ai");
  assert(release, "AI must prepare its real private coordinator");
  const coordinator = await json(root, "package.json");
  assert.equal(coordinator.name, release.name);
  assert.equal(coordinator.private, true);
  const version = coordinator.version;
  assert([release.oldVersion, release.newVersion].includes(version));
  const client = await json(root, "packages/ai/package.json");
  assert.equal(client.name, "@lapismd/ai");
  assert.equal(client.private, true);
  assert.equal(
    client.version,
    version,
    "Private client must remain coordinated",
  );
  const cargo = (await toml("Cargo.toml")).workspace;
  assert.equal(cargo.package.version, version);
  assert.equal(cargo.members.length, profile.cargoPackages);
  const lock = (await toml("Cargo.lock")).package;
  const packages = [];
  for (const directory of cargo.members) {
    assert(
      /^crates\/[\w-]+$/.test(directory),
      "AI Cargo member must be a real owned crate",
    );
    const pkg = (await toml(`${directory}/Cargo.toml`)).package;
    assert.equal(pkg.version.workspace, true);
    const entries = lock.filter(
      (entry) => entry.name === pkg.name && !entry.source,
    );
    assert.equal(
      entries.length,
      1,
      "Every native crate must have one local lock record",
    );
    assert.equal(
      entries[0].version,
      version,
      "Native lock versions must be coordinated",
    );
    packages.push({ name: pkg.name, path: directory, version });
  }
  for (const [name, dependency] of Object.entries(cargo.dependencies)) {
    if (packages.some((pkg) => pkg.name === name))
      assert.equal(
        dependency.version,
        version,
        "Internal Cargo ranges must be coordinated",
      );
  }
  const canonical = await canonicalHashes(root);
  for (const file of [
    "spec/src/current/contracts/release.md",
    "spec/src/current/progress/milestones.md",
  ])
    assert(
      canonical[file],
      "Actual release and milestone evidence is required",
    );
  const files = [
    "Cargo.toml",
    "Cargo.lock",
    "package.json",
    "packages/ai/package.json",
    "CHANGELOG.md",
    "packages/ai/CHANGELOG.md",
    "pnpm-lock.yaml",
  ];
  const hashes = {};
  for (const file of files)
    hashes[file] = hash(await readFile(path.join(root, file)));
  const readmes = {};
  for (const file of [
    "README.md",
    ...packages.map((pkg) => `${pkg.path}/README.md`),
  ]) {
    const bytes = await readFile(path.join(root, file));
    readmes[file] = {
      sha256: hash(bytes),
      hasInstallVersion: bytes
        .toString()
        .includes(`--version ${version} --locked`),
    };
  }
  return { version, packages, canonical, hashes, readmes };
}

export async function verifyAiRecipeOutputs(
  root,
  example,
  releases,
  before,
  changes,
  untracked,
  parseToml,
) {
  const after = await snapshotAiRecipeOutputs(
    root,
    example,
    releases,
    parseToml,
  );
  const release = releases.find((item) => item.name === "@lapismd/lapis-ai");
  assert.equal(before.version, release.oldVersion);
  assert.equal(after.version, release.newVersion);
  assert.deepEqual(
    after.canonical,
    before.canonical,
    "Version preparation must not fabricate canonical evidence",
  );
  assert.equal(after.packages.length, before.packages.length);
  for (const file of [
    "Cargo.toml",
    "Cargo.lock",
    "package.json",
    "packages/ai/package.json",
    "CHANGELOG.md",
    "packages/ai/CHANGELOG.md",
  ])
    assert.notEqual(
      after.hashes[file],
      before.hashes[file],
      `${file} must reflect the prepared release`,
    );
  for (const [file, input] of Object.entries(before.readmes)) {
    if (!input.hasInstallVersion) continue;
    const text = await readFile(path.join(root, file), "utf8");
    assert(
      !text.includes(`--version ${before.version} --locked`),
      "README retains stale native install version",
    );
    assert(
      after.readmes[file].hasInstallVersion,
      "README must use the prepared native install version",
    );
    assert.notEqual(after.readmes[file].sha256, input.sha256);
  }
  const allowed = new Set([
    ...Object.keys(before.hashes),
    ...Object.keys(before.readmes),
  ]);
  assert(
    changes.every((file) => allowed.has(file)),
    "AI recipe changed an unreviewed source output",
  );
  assert.deepEqual(
    untracked,
    [],
    "AI recipe created an unreviewed source file",
  );
  return after;
}
