import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  discoverRecipeManifests,
  selectRecipeCase,
} from "./version-recipe-layout.mjs";

test("recipe manifests include a public root and the CLI's actual workspace selection", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lapis-recipe-layout-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [dir, name] of [
    [".", "root"],
    ["internal/adapters/vue", "vue"],
  ]) {
    await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(
      path.join(root, dir, "package.json"),
      JSON.stringify({ name, version: "1.0.0" }),
    );
  }
  for (const shape of [
    { root: { dir: root } },
    { rootPackage: { dir: root } },
  ]) {
    const manifests = await discoverRecipeManifests(root, async () => ({
      ...shape,
      packages: [
        { dir: root },
        { dir: path.join(root, "internal/adapters/vue") },
      ],
    }));
    assert.deepEqual(
      manifests.map((m) => m.name),
      ["root", "vue"],
    );
    assert.equal(manifests[0].file, path.join(root, "package.json"));
  }
  await assert.rejects(
    discoverRecipeManifests(root, async () => ({
      packages: [{ dir: path.dirname(root) }],
    })),
    /outside/,
  );
  await writeFile(
    path.join(root, "internal/adapters/vue/package.json"),
    '{"name":"root","version":"1.0.0"}',
  );
  await assert.rejects(
    discoverRecipeManifests(root, async () => ({
      packages: [{ dir: path.join(root, "internal/adapters/vue") }],
    })),
    /Duplicate/,
  );
});

test("manual selection accepts reviewed immutable cases and rejects arbitrary dispatch coordinates", () => {
  const example = {
    repository: "lapismd/design-core",
    sourceSha: "a".repeat(40),
    qualification: { packageManager: "pnpm@10.32.1" },
    pending: { path: ".changeset/genuine.md", sha256: "b".repeat(64) },
  };
  const cases = { schemaVersion: 1, cases: { core: example } };
  assert.equal(selectRecipeCase(cases, "core"), example);
  for (const name of ["missing", "__proto__", "core\nsource=evil"])
    assert.throws(() => selectRecipeCase(cases, name));
  for (const bad of [
    { sourceSha: "main" },
    { repository: "private/other" },
    { qualification: { packageManager: "pnpm@latest" } },
    { pending: { path: "../escape.md", sha256: "b".repeat(64) } },
    { historicalNoteSourceSha: "main" },
    { afterVersionChecks: [["publish"]] },
  ]) {
    assert.throws(() =>
      selectRecipeCase(
        { ...cases, cases: { core: { ...example, ...bad } } },
        "core",
      ),
    );
  }
});

test("Node3 cases distinguish historical root evidence from current-tuple validation input", async () => {
  const cases = JSON.parse(
    await readFile(
      new URL("../version-recipe-cases.json", import.meta.url),
      "utf8",
    ),
  );
  const core = selectRecipeCase(cases, "core-changesets3"),
    mira = selectRecipeCase(cases, "mira-changesets3");
  for (const item of [core, mira]) {
    assert.equal(item.qualification.cliVersion, "3.0.3");
    assert.equal(item.qualification.packageManager, "pnpm@10.32.1");
    for (const [file, hash] of Object.entries(item.qualification.files))
      assert.equal(hash, item.closureEvidence.sourceHashes[file]);
  }
  assert.equal(core.historicalNoteSourceSha, undefined);
  assert.notEqual(core.sourceSha, core.closureEvidence.currentSourceSha);
  for (const [file, hash] of Object.entries(core.closureEvidence.sourceHashes))
    if (file !== "package.json")
      assert.equal(hash, core.closureEvidence.currentHashes[file]);
  assert.equal(mira.sourceSha, mira.closureEvidence.currentSourceSha);
  assert.notEqual(mira.sourceSha, mira.historicalNoteSourceSha);
  assert.deepEqual(
    mira.closureEvidence.sourceHashes,
    mira.closureEvidence.currentHashes,
  );
  assert(
    mira.closureEvidence.sourceHashes["internal/adapters/vue/package.json"],
  );
  assert(
    mira.closureEvidence.sourceHashes["packages/mira-editor/src/version.ts"],
  );
  assert.deepEqual(mira.afterVersionChecks, [
    ["exec", "node", "scripts/sync-release-versions.mjs", "--check"],
  ]);
});
