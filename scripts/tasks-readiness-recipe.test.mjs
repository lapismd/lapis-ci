import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectRecipeCase } from "./version-recipe-layout.mjs";

test("Tasks readiness needs a new immutable recipe case rather than reusing the old receipt", async () => {
  const cases = JSON.parse(
    await readFile(
      new URL("../version-recipe-cases.json", import.meta.url),
      "utf8",
    ),
  );
  const current = selectRecipeCase(cases, "tasks-readiness-changesets3");
  assert.equal(current.sourceSha, "6b896f6d33bd5256c0838c6fde5e8effd6cff7dc");
  assert.equal(current.outputContract, "tasks-coordinated-v1");
  assert.equal(current.qualification.cliVersion, "3.0.3");
  assert.equal(Object.keys(current.qualification.files).length, 4);
  assert.notEqual(
    current.sourceSha,
    cases.cases["tasks-changesets3"].sourceSha,
  );
  assert.deepEqual(current.expectedReleases, [
    {
      name: "@lapis-notes/lapis-plugin-tasks",
      oldVersion: "0.2.1",
      newVersion: "0.2.2",
    },
  ]);
});
