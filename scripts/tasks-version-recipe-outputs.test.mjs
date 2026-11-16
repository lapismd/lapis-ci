import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  assertTasksRecipePlan,
  snapshotTasksRecipe,
  verifyTasksRecipeOutputs,
  validateTasksRecipeCase,
} from "./tasks-version-recipe-outputs.mjs";

const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const selected = data.cases["tasks-readiness-changesets3"];
const releases = selected.expectedReleases;
const canonical = "spec/src/plugins/tasks/index.md",
  maintenance = ".changeset/tasks-registry-readiness.md";
const changes = [
  "package.json",
  "manifest.json",
  "CHANGELOG.md",
  canonical,
  maintenance,
];
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "tasks-recipe-output-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({
      name: releases[0].name,
      version: "0.2.1",
      dependencies: { yaml: "^2.9.0" },
    }),
    "manifest.json": JSON.stringify({
      id: "tasks",
      distribution: "first-party-external",
      version: "0.2.1",
    }),
    "pnpm-lock.yaml": JSON.stringify({
      lockfileVersion: "9.0",
      packages: { fixture: { integrity: "unchanged" } },
    }),
    [canonical]:
      "# Tasks\n\nRelease package and runtime manifest version: `0.2.1`.\nExisting evidence.\n",
    "CHANGELOG.md": "# Tasks\n\n## 0.2.1\nPrevious release.\n",
    [maintenance]: "---\n---\n\nMaintenance only.\n",
  };
  for (const file of Object.keys(selected.closureEvidence.sourceHashes))
    files[file] ??= "unchanged source: " + file;
  const write = async (file, bytes) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), bytes);
  };
  for (const [file, bytes] of Object.entries(files)) await write(file, bytes);
  const before = await snapshotTasksRecipe(
    root,
    selected,
    releases,
    JSON.parse,
  );
  const changeVersion = async (file) => {
    const value = JSON.parse(await readFile(path.join(root, file), "utf8"));
    value.version = "0.2.2";
    await write(file, JSON.stringify(value));
  };
  await changeVersion("package.json");
  await changeVersion("manifest.json");
  await write(canonical, files[canonical].replace("`0.2.1`", "`0.2.2`"));
  await write(
    "CHANGELOG.md",
    "# Tasks\n\n## 0.2.2\nGenuine fixture note.\n\n## 0.2.1\nPrevious release.\n",
  );
  await rm(path.join(root, maintenance));
  return {
    root,
    before,
    write,
    verify: (paths = changes, untracked = []) =>
      verifyTasksRecipeOutputs(
        root,
        selected,
        releases,
        before,
        paths,
        untracked,
        JSON.parse,
      ),
  };
}
test("Tasks proof accepts only coordinated versions with unchanged graph, public contracts and source evidence", async (t) => {
  const f = await fixture(t),
    result = await f.verify();
  assert.equal(result.packageVersion, "0.2.2");
  assert.equal(result.manifestVersion, "0.2.2");
  assert(result.lockGraphUnchanged && result.canonicalVersionOnly);
});
for (const [name, file, bytes] of [
  [
    "package contract",
    "package.json",
    JSON.stringify({
      name: releases[0].name,
      version: "0.2.2",
      dependencies: { yaml: "*" },
    }),
  ],
  [
    "runtime identity",
    "manifest.json",
    JSON.stringify({
      id: "foreign",
      distribution: "first-party-external",
      version: "0.2.2",
    }),
  ],
  [
    "lock graph",
    "pnpm-lock.yaml",
    JSON.stringify({
      lockfileVersion: "9.0",
      packages: { fixture: { integrity: "changed" } },
    }),
  ],
  [
    "canonical evidence",
    canonical,
    "# Tasks\nRelease package and runtime manifest version: `0.2.2`.\nFabricated evidence.\n",
  ],
  ["release helper", "scripts/release.mjs", "changed helper"],
  [
    "new imported helper",
    "scripts/release-install-readiness.mjs",
    "changed imported source",
  ],
  ["workflow", ".github/workflows/ci.yml", "changed workflow"],
  ["changelog", "CHANGELOG.md", "# Tasks\nNo prepared version\n"],
  ["maintenance note", maintenance, "---\n---\n\nChanged note\n"],
])
  test(`Tasks proof rejects changed ${name}`, async (t) => {
    const f = await fixture(t);
    await f.write(file, bytes);
    await assert.rejects(f.verify());
  });
test("Tasks proof rejects unrelated modified or new output paths", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.verify([...changes, "spec/src/unrelated.md"]),
    /unreviewed path/,
  );
  await assert.rejects(
    f.verify(changes, ["unexpected.txt"]),
    /unreviewed files/,
  );
});
test("Tasks case rejects old helper closures, mismatched source/config context and non-patch plans", () => {
  assert(validateTasksRecipeCase(selected));
  for (const edit of [
    (c) =>
      delete c.qualification.files["scripts/release-install-readiness.mjs"],
    (c) => (c.closureEvidence.currentSourceSha = "f".repeat(40)),
    (c) => (c.qualification.configSha256 = "f".repeat(64)),
    (c) => (c.expectedReleases[0].newVersion = "0.3.0"),
    (c) => (c.repository = "lapismd/lapis-server"),
    (c) => (c.outputContract = "unknown"),
  ]) {
    const copy = structuredClone(selected);
    edit(copy);
    assert.throws(() => validateTasksRecipeCase(copy));
  }
  assert.throws(
    () =>
      assertTasksRecipePlan(selected, [
        { ...releases[0], newVersion: "0.2.3" },
      ]),
    /version plan/,
  );
  assert.throws(() =>
    assertTasksRecipePlan(selected, [
      ...releases,
      { name: "foreign", oldVersion: "1.0.0", newVersion: "1.0.1" },
    ]),
  );
});
test("the real hosted command snapshots before mutation and verifies Tasks outputs afterward", async () => {
  const source = await readFile(
    new URL("./qualify-version-recipe.mjs", import.meta.url),
    "utf8",
  );
  assert(
    source.indexOf("receipt.tasksOutputsBefore =") <
      source.indexOf('run(["release:version"], env)'),
  );
  assert(
    source.indexOf("receipt.tasksOutputsAfter =") >
      source.indexOf('run(["release:version"], env)'),
  );
  const workflow = await readFile(
    new URL("../.github/workflows/qualify-version-recipe.yml", import.meta.url),
    "utf8",
  );
  assert(workflow.includes("- tasks-readiness-changesets3"));
  assert(workflow.includes("if: github.ref == 'refs/heads/main'"));
});
