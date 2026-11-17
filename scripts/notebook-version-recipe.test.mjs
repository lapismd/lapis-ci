import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { selectRecipeCase } from "./version-recipe-layout.mjs";
import {
  assertPluginRecipePlan,
  snapshotPluginRecipe,
  verifyPluginRecipeOutputs,
} from "./plugin-version-recipe-outputs.mjs";

const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const selected = data.cases["notebook-changesets3"];
const releases = selected.expectedReleases;
const canonical = "spec/src/plugins/notebook/index.md";
const maintenance = ".changeset/notebook-version-runtime.md";
const changes = [
  "package.json",
  "manifest.json",
  "CHANGELOG.md",
  canonical,
  maintenance,
  selected.pending.path,
];

test("Notebook qualifies its native source recipe and runtime ID without changing private packages", async () => {
  const data = JSON.parse(
    await readFile(
      new URL("../version-recipe-cases.json", import.meta.url),
      "utf8",
    ),
  );
  const selected = selectRecipeCase(data, "notebook-changesets3");
  assert.equal(selected.repository, "lapismd/lapis-plugin-notebook");
  assert.equal(selected.sourceSha, "64d5f7b7e21e6e9d98a821898f9c1411a620d391");
  assert.equal(selected.outputContract, "notebook-coordinated-v1");
  assert.equal(
    selected.qualification.scripts["release:version"],
    "node scripts/release.mjs version",
  );
  assert.equal(selected.qualification.packageManager, "pnpm@10.32.1");
  assert.equal(selected.qualification.formatterPolicy, "unconfigured");
  assert.equal(selected.ignorePnpmfile, true);
  assert.equal(selected.strictPeerDependencies, undefined);
  assert.equal(selected.versionOutputs.length, 2);
  assert.equal(
    selected.historicalNoteSourceSha,
    "cb79a6a7d294f0f9c83deea7410296db5ecc4fcc",
  );
  assert.equal(
    Object.keys(selected.closureEvidence.sourceHashes).filter((p) =>
      /^packages\/[^/]+\/package.json$/.test(p),
    ).length,
    6,
  );
  assert.deepEqual(selected.expectedReleases, [
    {
      name: "@lapis-notes/lapis-plugin-notebook",
      oldVersion: "0.2.4",
      newVersion: "0.2.5",
    },
  ]);
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "notebook-recipe-output-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({
      name: releases[0].name,
      version: "0.2.4",
      dependencies: { yaml: "^2.9.0" },
    }),
    "manifest.json": JSON.stringify({
      id: "lapis-notebook",
      distribution: "first-party-external",
      version: "0.2.4",
      name: "Notebook",
    }),
    "pnpm-lock.yaml": JSON.stringify({
      lockfileVersion: "9.0",
      packages: { fixture: { integrity: "unchanged" } },
    }),
    [canonical]:
      "# Notebook\n\nRelease package and runtime manifest version: `0.2.4`.\nExisting evidence.\n",
    "CHANGELOG.md": "# Notebook\n\n## 0.2.4\nPrevious release.\n",
    [maintenance]: "---\n---\n\nMaintenance only.\n",
  };
  for (const file of Object.keys(selected.closureEvidence.sourceHashes))
    files[file] ??= "unchanged source: " + file;
  const write = async (file, bytes) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), bytes);
  };
  for (const [file, bytes] of Object.entries(files)) await write(file, bytes);
  const before = await snapshotPluginRecipe(
    root,
    selected,
    releases,
    JSON.parse,
  );
  for (const file of ["package.json", "manifest.json"]) {
    const value = JSON.parse(files[file]);
    value.version = "0.2.5";
    await write(file, JSON.stringify(value));
  }
  await write(canonical, files[canonical].replace("`0.2.4`", "`0.2.5`"));
  await write(
    "CHANGELOG.md",
    "# Notebook\n\n## 0.2.5\nHistorical fixture note.\n\n## 0.2.4\nPrevious release.\n",
  );
  await rm(path.join(root, maintenance));
  return {
    root,
    before,
    write,
    verify: (paths = changes, untracked = []) =>
      verifyPluginRecipeOutputs(
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

test("Notebook proof accepts coordinated root, runtime manifest and canonical versions with private packages unchanged", async (t) => {
  const f = await fixture(t),
    result = await f.verify();
  assert.equal(result.packageVersion, "0.2.5");
  assert.equal(result.manifestVersion, "0.2.5");
  assert(
    result.lockGraphUnchanged &&
      result.canonicalVersionOnly &&
      result.maintenanceNotesUnchangedOrConsumed,
  );
  assert.equal(
    Object.keys(result.stable).filter((p) =>
      /^packages\/[^/]+\/package.json$/.test(p),
    ).length,
    6,
  );
});

for (const [name, file, bytes] of [
  [
    "public dependency contract",
    "package.json",
    JSON.stringify({
      name: releases[0].name,
      version: "0.2.5",
      dependencies: { yaml: "*" },
    }),
  ],
  [
    "runtime ID",
    "manifest.json",
    JSON.stringify({
      id: "notebook",
      distribution: "first-party-external",
      version: "0.2.5",
      name: "Notebook",
    }),
  ],
  [
    "runtime fields",
    "manifest.json",
    JSON.stringify({
      id: "lapis-notebook",
      distribution: "first-party-external",
      version: "0.2.5",
      name: "Changed",
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
    "# Notebook\nRelease package and runtime manifest version: `0.2.5`.\nFabricated evidence.\n",
  ],
  ["version helper", "scripts/release.mjs", "changed helper"],
  [
    "imported release candidate helper",
    "scripts/release-candidate.mjs",
    "changed helper",
  ],
  [
    "version workflow",
    ".github/workflows/version-packages.yml",
    "changed workflow",
  ],
  [
    "non-version canonical chapter",
    "spec/src/plugins/notebook/documents.md",
    "changed evidence",
  ],
  ["maintenance note", maintenance, "---\n---\n\nChanged note\n"],
  ["changelog", "CHANGELOG.md", "# Notebook\nNo prepared version\n"],
  ...["core", "duckdb-assets", "duckdb", "input", "stdlib", "worker"].map(
    (name) => [
      "private " + name + " package",
      "packages/" + name + "/package.json",
      JSON.stringify({ private: true, version: "0.2.5" }),
    ],
  ),
])
  test("Notebook proof rejects changed " + name, async (t) => {
    const f = await fixture(t);
    await f.write(file, bytes);
    await assert.rejects(f.verify());
  });

test("Notebook proof rejects unexpected tracked and untracked output", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.verify([...changes, "unexpected.txt"]),
    /unreviewed path/,
  );
  await assert.rejects(
    f.verify(changes, ["unexpected.txt"]),
    /unreviewed files/,
  );
});
test("Notebook empty maintenance note may remain unchanged but cannot acquire release intent", async (t) => {
  const f = await fixture(t);
  await f.write(maintenance, f.before.maintenance);
  await f.verify();
  await f.write(
    maintenance,
    '---\n"@lapis-notes/lapis-plugin-notebook": patch\n---\nNew intent\n',
  );
  await assert.rejects(f.verify(), /must not create release intent/);
});
test("Notebook case rejects unreviewed recipe, tooling, plan and source closure changes", () => {
  for (const edit of [
    (c) => delete c.outputContract,
    (c) => (c.repository = "lapismd/lapis-server"),
    (c) => (c.qualification.cliVersion = "2.31.0"),
    (c) => (c.qualification.packageManager = "pnpm@10.34.5"),
    (c) => (c.qualification.formatterPolicy = undefined),
    (c) => (c.qualification.scripts["release:version"] = "changeset version"),
    (c) => (c.strictPeerDependencies = true),
    (c) => (c.ignorePnpmfile = false),
    (c) => (c.expectedReleases[0].newVersion = "0.3.0"),
    (c) => (c.closureEvidence.currentSourceSha = "f".repeat(40)),
    (c) => delete c.qualification.files["scripts/release-candidate.mjs"],
    (c) => {
      delete c.closureEvidence.sourceHashes["packages/core/package.json"];
      delete c.closureEvidence.currentHashes["packages/core/package.json"];
    },
  ]) {
    const copy = structuredClone(data);
    edit(copy.cases["notebook-changesets3"]);
    assert.throws(() => selectRecipeCase(copy, "notebook-changesets3"));
  }
  assert.throws(() =>
    assertPluginRecipePlan(selected, [
      ...releases,
      { name: "private-package", oldVersion: "0.0.0", newVersion: "0.0.1" },
    ]),
  );
});
test("hosted Notebook proof snapshots before its unchanged command and verifies outputs afterward", async () => {
  const source = await readFile(
    new URL("./qualify-version-recipe.mjs", import.meta.url),
    "utf8",
  );
  const command = source.indexOf('run(["release:version"], env)');
  assert(source.indexOf("receipt.notebookOutputsBefore =") < command);
  assert(source.indexOf("receipt.notebookOutputsAfter =") > command);
  const workflow = await readFile(
    new URL("../.github/workflows/qualify-version-recipe.yml", import.meta.url),
    "utf8",
  );
  assert(workflow.includes("- notebook-changesets3"));
  assert(workflow.includes("if: github.ref == 'refs/heads/main'"));
});
