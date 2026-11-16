import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { canonicalHashes } from "./native-version-recipe-outputs.mjs";
import { validateCorepackRecipeProfile } from "./corepack-version-recipe.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function assertCorepackRecipePlan(example, changes) {
  validateCorepackRecipeProfile(example);
  assert.deepEqual(
    changes.map(({ name, oldVersion, newVersion }) => ({
      name,
      oldVersion,
      newVersion,
    })),
    example.expectedReleases,
    "Unexpected Visual Delta root release plan",
  );
}

export async function snapshotCorepackRecipeOutputs(root, example, changes) {
  assertCorepackRecipePlan(example, changes);
  const notes = (await readdir(path.join(root, ".changeset")))
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) => `.changeset/${file}`)
    .sort();
  assert.deepEqual(
    notes,
    [example.pending.path, ...Object.keys(example.emptyChangesets)].sort(),
    "Unexpected source release intent",
  );
  for (const [file, expected] of Object.entries(example.emptyChangesets)) {
    const bytes = await readFile(path.join(root, file));
    assert.equal(hash(bytes), expected);
    assert.match(
      bytes.toString(),
      /^---\s*\n---(?:\s|$)/,
      "Maintenance note must remain empty release intent",
    );
  }
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(manifest.name, changes[0].name);
  assert.equal(manifest.version, changes[0].oldVersion);
  assert.notEqual(manifest.private, true);
  return {
    manifest,
    changelog: await readFile(path.join(root, "CHANGELOG.md"), "utf8"),
    canonical: await canonicalHashes(root),
  };
}

/** The root recipe may version one package and consume reviewed notes only. */
export async function verifyCorepackRecipeOutputs(
  root,
  example,
  changes,
  before,
  changed,
  untracked,
) {
  assertCorepackRecipePlan(example, changes);
  const allowed = [
    "package.json",
    "CHANGELOG.md",
    example.pending.path,
    ...Object.keys(example.emptyChangesets),
  ];
  assert.equal(
    untracked.length,
    0,
    "Visual Delta created unexpected source files",
  );
  assert(
    changed.every((file) => allowed.includes(file)),
    "Visual Delta changed unexpected source paths",
  );
  assert(
    changed.includes("package.json") && changed.includes("CHANGELOG.md"),
    "Visual Delta must execute a genuine version mutation",
  );
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  assert.deepEqual(
    manifest,
    { ...before.manifest, version: changes[0].newVersion },
    "Visual Delta modified non-version manifest fields",
  );
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  assert(
    changelog.includes(`\n## ${changes[0].newVersion}\n`),
    "Visual Delta is missing its prepared changelog",
  );
  const previousEntries = before.changelog.slice(
    before.changelog.indexOf("\n## "),
  );
  assert(
    before.changelog.includes("\n## ") && changelog.endsWith(previousEntries),
    "Visual Delta changed historical changelog entries",
  );
  for (const [file, expected] of Object.entries(
    example.closureEvidence.sourceHashes,
  )) {
    if (allowed.includes(file)) continue;
    assert.equal(
      hash(await readFile(path.join(root, file))),
      expected,
      `Visual Delta changed bound source ${file}`,
    );
  }
  assert.deepEqual(
    await canonicalHashes(root),
    before.canonical,
    "Visual Delta changed canonical requirements during versioning",
  );
  const notes = await readdir(path.join(root, ".changeset"));
  for (const file of [
    example.pending.path,
    ...Object.keys(example.emptyChangesets),
  ])
    assert(
      !notes.includes(path.basename(file)),
      "Visual Delta did not consume its reviewed release notes",
    );
  return {
    version: manifest.version,
    canonicalFilesUnchanged: Object.keys(before.canonical).length,
    lockfileUnchanged: true,
    historicalChangelogUnchanged: true,
  };
}
