import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  assertPluginRecipePlan,
  snapshotPluginRecipe,
  verifyPluginRecipeOutputs,
  validatePluginRecipeCase,
} from "./plugin-version-recipe-outputs.mjs";

const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const selected = data.cases["docs-readiness-changesets3"];
const releases = selected.expectedReleases;
const canonical = "spec/src/plugins/docs/index.md",
  maintenance = ".changeset/docs-registry-readiness.md";
const changes = [
  "package.json",
  "manifest.json",
  "CHANGELOG.md",
  canonical,
  maintenance,
  "spec-validator.config.mjs",
  "spec/src/spec-governance.md",
  "README.md",
];
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "docs-recipe-output-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({
      name: releases[0].name,
      version: "0.3.0",
      dependencies: { yaml: "^2.9.0" },
    }),
    "manifest.json": JSON.stringify({
      id: "docs",
      distribution: "first-party-external",
      version: "0.3.0",
    }),
    "pnpm-lock.yaml": JSON.stringify({
      lockfileVersion: "9.0",
      packages: { fixture: { integrity: "unchanged" } },
    }),
    [canonical]:
      "# Docs\n\nRelease package and runtime manifest version: `0.3.0`.\nExisting evidence.\n",
    "CHANGELOG.md": "# Docs\n\n## 0.3.0\nPrevious release.\n",
    [maintenance]: "---\n---\n\nMaintenance only.\n",
  };
  Object.assign(files, {
    "spec-validator.config.mjs":
      'export default {version: "0.3.0", validators: "unchanged"};\n',
    "spec/src/spec-governance.md":
      "# Governance\nValidator package version pin: `0.3.0`.\nExisting authority.\n",
    "README.md":
      "# Docs\nPackage version: `@lapis-notes/lapis-plugin-docs@0.3.0`.\nExisting instructions.\n",
  });
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
  const changeVersion = async (file) => {
    const value = JSON.parse(await readFile(path.join(root, file), "utf8"));
    value.version = "0.4.0";
    await write(file, JSON.stringify(value));
  };
  await changeVersion("package.json");
  await changeVersion("manifest.json");
  for (const file of [
    canonical,
    "spec-validator.config.mjs",
    "spec/src/spec-governance.md",
    "README.md",
  ])
    await write(file, files[file].replace("0.3.0", "0.4.0"));
  await write(
    "CHANGELOG.md",
    "# Docs\n\n## 0.4.0\nGenuine fixture note.\n\n## 0.3.0\nPrevious release.\n",
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
test("Docs proof accepts only coordinated versions with unchanged graph, public contracts and source evidence", async (t) => {
  const f = await fixture(t),
    result = await f.verify();
  assert.equal(result.packageVersion, "0.4.0");
  assert.equal(result.manifestVersion, "0.4.0");
  assert(result.lockGraphUnchanged && result.canonicalVersionOnly);
});
for (const [name, file, bytes] of [
  [
    "package contract",
    "package.json",
    JSON.stringify({
      name: releases[0].name,
      version: "0.4.0",
      dependencies: { yaml: "*" },
    }),
  ],
  [
    "runtime identity",
    "manifest.json",
    JSON.stringify({
      id: "foreign",
      distribution: "first-party-external",
      version: "0.4.0",
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
    "# Docs\nRelease package and runtime manifest version: `0.4.0`.\nFabricated evidence.\n",
  ],
  ["release helper", "scripts/release.mjs", "changed helper"],
  [
    "new imported helper",
    "scripts/release-install-readiness.mjs",
    "changed imported source",
  ],
  ["workflow", ".github/workflows/ci.yml", "changed workflow"],
  ["advisory authority", ".github/development-audit.json", "renewed policy"],
  [
    "validator configuration",
    "spec-validator.config.mjs",
    'export default {version: "0.4.0", validators: "weakened"};\n',
  ],
  [
    "governance authority",
    "spec/src/spec-governance.md",
    "# Governance\nValidator package version pin: `0.4.0`.\nNew authority.\n",
  ],
  [
    "README instructions",
    "README.md",
    "# Docs\nPackage version: `@lapis-notes/lapis-plugin-docs@0.4.0`.\nDifferent instructions.\n",
  ],
  ["changelog", "CHANGELOG.md", "# Docs\nNo prepared version\n"],
  ["maintenance note", maintenance, "---\n---\n\nChanged note\n"],
])
  test(`Docs proof rejects changed ${name}`, async (t) => {
    const f = await fixture(t);
    await f.write(file, bytes);
    await assert.rejects(f.verify());
  });
test("Docs proof rejects unrelated modified or new output paths", async (t) => {
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
test("Docs case rejects old helper closures, mismatched source/config context and non-minor plans", () => {
  assert(validatePluginRecipeCase(selected));
  for (const edit of [
    (c) =>
      delete c.qualification.files["scripts/release-install-readiness.mjs"],
    (c) => (c.closureEvidence.currentSourceSha = "f".repeat(40)),
    (c) => (c.qualification.configSha256 = "f".repeat(64)),
    (c) => (c.expectedReleases[0].newVersion = "0.3.1"),
    (c) => (c.strictPeerDependencies = false),
    (c) => c.versionOutputs.pop(),
    (c) => (c.repository = "lapismd/lapis-server"),
    (c) => (c.outputContract = "unknown"),
  ]) {
    const copy = structuredClone(selected);
    edit(copy);
    assert.throws(() => validatePluginRecipeCase(copy));
  }
  assert.throws(
    () =>
      assertPluginRecipePlan(selected, [
        { ...releases[0], newVersion: "0.2.3" },
      ]),
    /version plan/,
  );
  assert.throws(() =>
    assertPluginRecipePlan(selected, [
      ...releases,
      { name: "foreign", oldVersion: "1.0.0", newVersion: "1.0.1" },
    ]),
  );
});
test("the real hosted command snapshots before mutation and verifies Docs outputs afterward", async () => {
  const source = await readFile(
    new URL("./qualify-version-recipe.mjs", import.meta.url),
    "utf8",
  );
  assert(
    source.indexOf("receipt.docsOutputsBefore =") <
      source.indexOf('run(["release:version"], env)'),
  );
  assert(
    source.indexOf("receipt.docsOutputsAfter =") >
      source.indexOf('run(["release:version"], env)'),
  );
  const workflow = await readFile(
    new URL("../.github/workflows/qualify-version-recipe.yml", import.meta.url),
    "utf8",
  );
  assert(workflow.includes("- docs-readiness-changesets3"));
  assert(workflow.includes("if: github.ref == 'refs/heads/main'"));
});

for (const [file, bytes] of [
  [
    "spec/src/plugins/docs/index.md",
    "Release package and runtime manifest version: `0.3.0`.\n",
  ],
  [
    "spec-validator.config.mjs",
    'export default {version: "0.3.0", validators: "unchanged"};\n',
  ],
  [
    "spec/src/spec-governance.md",
    "# Governance\nValidator package version pin: `0.3.0`.\nExisting authority.\n",
  ],
  [
    "README.md",
    "# Docs\nPackage version: `@lapis-notes/lapis-plugin-docs@0.3.0`.\nExisting instructions.\n",
  ],
])
  test(`Docs proof rejects an unsynchronized version marker in ${file}`, async (t) => {
    const f = await fixture(t);
    await f.write(file, bytes);
    await assert.rejects(f.verify());
  });
