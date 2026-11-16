import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/** Direct Changesets may mutate only its reviewed release and consumed note. */
export async function verifyDirectRecipeOutputs(
  root,
  selected,
  manifests,
  changes,
  changed,
  untracked,
) {
  if (selected.qualification.mode !== "direct") return;
  const allowed = new Set([selected.pending.path]);
  const versions = {};
  for (const pkg of manifests) {
    const release = changes.find((item) => item.name === pkg.name);
    const version = release?.newVersion ?? pkg.oldVersion;
    assert.equal(
      JSON.parse(await readFile(pkg.file, "utf8")).version,
      version,
      "Unexpected direct recipe package version",
    );
    versions[pkg.name] = version;
    if (release) {
      allowed.add(path.relative(root, pkg.file));
      allowed.add(path.relative(root, pkg.changelog));
    }
  }
  assert.equal(
    untracked.length,
    0,
    "Direct recipe created unexpected source files",
  );
  assert.ok(
    changed.every((file) => allowed.has(file)),
    "Direct recipe changed unexpected source paths",
  );
  for (const [file, expected] of Object.entries(
    selected.closureEvidence.sourceHashes,
  )) {
    if (allowed.has(file)) continue;
    const actual = createHash("sha256")
      .update(await readFile(path.join(root, file)))
      .digest("hex");
    assert.equal(
      actual,
      expected,
      `Direct recipe changed bound source ${file}`,
    );
  }
  return versions;
}
