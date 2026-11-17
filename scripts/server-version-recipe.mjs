import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const SERVER_CONTRACT = "server-private-root-v1";
export const SERVER_SOURCE_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  ".changeset/config.json",
  ".prettierrc.json",
  ".prettierignore",
  ".github/workflows/release.yml",
  "scripts/release-github.mjs",
  "Cargo.toml",
  "Cargo.lock",
  "spec/records/2026-11-16-katex-audit-exception.md",
  "CHANGELOG.md",
  ".changeset/plugin-agent-skills.md",
  ".changeset/server-http-renderer-security.md",
];
const formatterFiles = [".prettierrc.json", ".prettierignore"];
const script =
  "changeset version && pnpm install --lockfile-only && prettier package.json CHANGELOG.md --write";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const withoutVersion = ({ version, ...rest }) => rest;

export function validateServerRecipeCase(example) {
  if (example.privateRootContract === undefined) {
    assert.notEqual(
      example.repository,
      "lapismd/lapis-server",
      "Server requires its reviewed private-root contract",
    );
    return false;
  }
  assert.equal(example.privateRootContract, SERVER_CONTRACT);
  assert.equal(example.repository, "lapismd/lapis-server");
  for (const key of [
    "profile",
    "outputContract",
    "ignorePnpmfile",
    "strictPeerDependencies",
    "historicalNoteSourceSha",
  ])
    assert.equal(
      example[key],
      undefined,
      "Unreviewed Server recipe option: " + key,
    );
  assert.deepEqual(example.afterVersionChecks ?? [], []);
  assert.deepEqual(example.versionOutputs ?? [], []);
  const qualification = example.qualification;
  assert.equal(qualification.schemaVersion, 1);
  assert.equal(qualification.cliVersion, "3.0.3");
  assert.equal(qualification.packageManager, "pnpm@10.34.5");
  assert.equal(qualification.nodeMajor ?? 24, 24);
  assert.equal(qualification.mode, undefined);
  assert.equal(qualification.formatterPolicy, undefined);
  assert.deepEqual(qualification.scripts, { "release:version": script });
  const closure = example.closureEvidence;
  assert.equal(closure?.comparison, "exact-current-tuple");
  assert.equal(closure.currentSourceSha, example.sourceSha);
  assert.deepEqual(closure.currentHashes, closure.sourceHashes);
  assert.deepEqual(
    Object.keys(closure.sourceHashes).sort(),
    [...SERVER_SOURCE_FILES].sort(),
    "Server requires its complete reviewed source closure",
  );
  for (const value of Object.values(closure.sourceHashes))
    assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(
    qualification.configSha256,
    closure.sourceHashes[".changeset/config.json"],
  );
  assert.deepEqual(
    Object.keys(qualification.files).sort(),
    [...formatterFiles].sort(),
  );
  for (const file of formatterFiles)
    assert.equal(qualification.files[file], closure.sourceHashes[file]);
  assert.deepEqual(
    example.pendingNotes,
    SERVER_SOURCE_FILES.filter((file) =>
      /^\.changeset\/.*\.md$/.test(file),
    ).map((file) => ({ path: file, sha256: closure.sourceHashes[file] })),
    "Server requires both genuine source release notes",
  );
  assert.deepEqual(example.pending, example.pendingNotes[0]);
  assert.deepEqual(example.expectedReleases, [
    { name: "@lapismd/lapis-server", oldVersion: "2.3.0", newVersion: "2.4.0" },
  ]);
  return true;
}

export function assertServerRecipePlan(example, releases) {
  if (!validateServerRecipeCase(example)) return;
  assert.deepEqual(
    releases.map(({ name, oldVersion, newVersion }) => ({
      name,
      oldVersion,
      newVersion,
    })),
    example.expectedReleases,
    "Server plan differs from its genuine reviewed private minor release",
  );
}

export async function snapshotServerRecipe(root, example, releases, parseYaml) {
  assert(validateServerRecipeCase(example));
  assertServerRecipePlan(example, releases);
  parseYaml ??= createRequire(path.join(root, "package.json"))("yaml").parse;
  const read = (file) => readFile(path.join(root, file), "utf8");
  const mutable = new Set([
    "package.json",
    "pnpm-lock.yaml",
    "CHANGELOG.md",
    ...example.pendingNotes.map((note) => note.path),
  ]);
  const stable = {};
  for (const file of SERVER_SOURCE_FILES.filter((file) => !mutable.has(file)))
    stable[file] = hash(await read(file));
  const config = JSON.parse(await read(".changeset/config.json"));
  assert.deepEqual(config.privatePackages, { version: true, tag: true });
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.name, "@lapismd/lapis-server");
  assert.equal(
    pkg.private,
    true,
    "Server must remain private and unpublished to npm",
  );
  const notes = {};
  for (const note of example.pendingNotes)
    notes[note.path] = await read(note.path)
      .then(hash)
      .catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
  return {
    package: pkg,
    lock: parseYaml(await read("pnpm-lock.yaml")),
    changelog: await read("CHANGELOG.md"),
    notes,
    stable,
  };
}

export async function verifyServerRecipeOutputs(
  root,
  example,
  releases,
  before,
  changes,
  untracked,
  parseYaml,
) {
  const after = await snapshotServerRecipe(root, example, releases, parseYaml);
  const release = example.expectedReleases[0];
  assert.equal(before.package.version, release.oldVersion);
  assert.equal(after.package.version, release.newVersion);
  assert.deepEqual(
    withoutVersion(after.package),
    withoutVersion(before.package),
    "Server manifest, dependency and audit policy must remain unchanged",
  );
  assert.deepEqual(
    after.lock,
    before.lock,
    "Server lock graph changed during version preparation",
  );
  assert.deepEqual(
    after.stable,
    before.stable,
    "Server source/configuration changed",
  );
  for (const note of example.pendingNotes) {
    assert.equal(
      before.notes[note.path],
      note.sha256,
      "Genuine source note drifted",
    );
    assert.equal(
      after.notes[note.path],
      null,
      "Genuine source note was not consumed",
    );
  }
  assert.notEqual(after.changelog, before.changelog);
  assert(
    after.changelog.split("\n").includes("## " + release.newVersion),
    "Missing Server changelog version",
  );
  const required = [
    "package.json",
    "CHANGELOG.md",
    ...example.pendingNotes.map((note) => note.path),
  ];
  const allowed = new Set([...required, "pnpm-lock.yaml"]);
  assert.deepEqual(
    changes.filter((file) => !allowed.has(file)),
    [],
    "Unexpected Server output",
  );
  for (const file of required)
    assert(changes.includes(file), "Missing Server output: " + file);
  assert.deepEqual(untracked, [], "Untracked Server recipe output");
  return {
    packageVersion: after.package.version,
    privatePackageUnchanged: true,
    lockGraphUnchanged: true,
    dependencyAndAuditPolicyUnchanged: true,
    genuineNotesConsumed: example.pendingNotes.map((note) => note.path),
    stable: after.stable,
  };
}
