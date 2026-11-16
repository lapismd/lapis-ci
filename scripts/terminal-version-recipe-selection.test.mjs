import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectRecipeCase } from "./version-recipe-layout.mjs";

const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
test("the reviewed Terminal source needs its own exact Node24/Rust offline case", () => {
  const selected = selectRecipeCase(data, "terminal-changesets2-native");
  assert.equal(selected.sourceSha, "6808f839e59279cec601f5b998d695ae29ad4963");
  assert.equal(selected.profile, "terminal-node24-rust-offline");
  assert.equal(
    selected.qualification.scripts["release:version"],
    "node scripts/changeset-version.mjs",
  );
  assert.equal(selected.qualification.packageManager, "pnpm@10.32.1");
  assert.equal(selected.nativeTools.nodeVersion, "24.15.0");
  assert.equal(selected.nativeTools.rustVersion, "1.99.0");
  assert.equal(selected.nativeTools.minimumFreeGiB, 20);
  assert.equal(selected.nativeTools.cargoPackages, 4);
  assert.equal(selected.nativeTools.cpuCount, 4);
});
