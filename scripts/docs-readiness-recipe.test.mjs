import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectRecipeCase } from "./version-recipe-layout.mjs";
test("Docs readiness binds a new exact source closure and all five real version outputs", async () => {
  const data = JSON.parse(
    await readFile(
      new URL("../version-recipe-cases.json", import.meta.url),
      "utf8",
    ),
  );
  const selected = selectRecipeCase(data, "docs-readiness-changesets3");
  assert.equal(selected.sourceSha, "3dc72ab588327c130aff99e39c832b53f2f72675");
  assert.equal(selected.outputContract, "docs-coordinated-v1");
  assert.equal(selected.qualification.packageManager, "pnpm@10.32.1");
  assert.equal(Object.keys(selected.qualification.files).length, 3);
  assert.equal(selected.versionOutputs.length, 5);
  assert.equal(selected.strictPeerDependencies, true);
  assert.equal(
    selected.historicalNoteSourceSha,
    "9e8e7ec23fc5d7f412f180e76ebcb3699a00cfed",
  );
  assert.deepEqual(selected.expectedReleases, [
    {
      name: "@lapis-notes/lapis-plugin-docs",
      oldVersion: "0.3.0",
      newVersion: "0.4.0",
    },
  ]);
  assert.notEqual(selected.sourceSha, data.cases["docs-changesets3"].sourceSha);
});
