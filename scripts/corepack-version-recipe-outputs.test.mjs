import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  snapshotCorepackRecipeOutputs,
  verifyCorepackRecipeOutputs,
} from "./corepack-version-recipe-outputs.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "lapis-corepack-outputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const example = JSON.parse(
    await readFile(new URL("../version-recipe-cases.json", import.meta.url)),
  ).cases["visual-delta-changesets3-corepack"];
  const manifest = {
    name: "@lapismd/storybook-addon-visual-delta",
    version: "0.1.5",
    dependencies: { retained: "^1.0.0" },
  };
  const empty = "---\n---\nMaintenance only.\n";
  for (const file of Object.keys(example.closureEvidence.sourceHashes)) {
    const bytes =
      file === "package.json"
        ? JSON.stringify(manifest)
        : file.endsWith("node-version-tooling.md")
          ? empty
          : file;
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), bytes);
    example.closureEvidence.sourceHashes[file] = hash(bytes);
  }
  example.closureEvidence.currentHashes = structuredClone(
    example.closureEvidence.sourceHashes,
  );
  example.qualification.files["pnpm-workspace.yaml"] =
    example.closureEvidence.sourceHashes["pnpm-workspace.yaml"];
  example.qualification.configSha256 =
    example.closureEvidence.sourceHashes[".changeset/config.json"];
  example.emptyChangesets[".changeset/node-version-tooling.md"] = hash(empty);
  await writeFile(
    path.join(root, example.pending.path),
    '---\n"@lapismd/storybook-addon-visual-delta": patch\n---\nHistorical validation input.\n',
  );
  await writeFile(
    path.join(root, "CHANGELOG.md"),
    "# Visual Delta\n\n## 0.1.5\n\nExisting release.\n",
  );
  await mkdir(path.join(root, "spec/src"), { recursive: true });
  await writeFile(
    path.join(root, "spec/src/index.md"),
    "Retained canonical requirement.\n",
  );
  const changes = example.expectedReleases;
  const before = await snapshotCorepackRecipeOutputs(root, example, changes);
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ ...manifest, version: "0.1.6" }),
  );
  await writeFile(
    path.join(root, "CHANGELOG.md"),
    "# Visual Delta\n\n## 0.1.6\n\nPatch release.\n\n## 0.1.5\n\nExisting release.\n",
  );
  for (const file of [
    example.pending.path,
    ...Object.keys(example.emptyChangesets),
  ])
    await rm(path.join(root, file));
  const changed = [
    "package.json",
    "CHANGELOG.md",
    ...Object.keys(example.emptyChangesets),
  ];
  const run = (extra = [], untracked = []) =>
    verifyCorepackRecipeOutputs(
      root,
      example,
      changes,
      before,
      [...changed, ...extra],
      untracked,
    );
  return { root, example, manifest, run };
}

test("actual root mutation preserves lock, canonical requirements and historical changelog", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.run(), {
    version: "0.1.6",
    canonicalFilesUnchanged: 1,
    lockfileUnchanged: true,
    historicalChangelogUnchanged: true,
  });
  await assert.rejects(f.run(["other.json"]), /unexpected source paths/);
  await assert.rejects(f.run([], ["extra.md"]), /unexpected source files/);
  await writeFile(
    path.join(f.root, "package.json"),
    JSON.stringify({
      ...f.manifest,
      version: "0.1.6",
      dependencies: { retained: "^2.0.0" },
    }),
  );
  await assert.rejects(f.run(), /non-version manifest/);
});

test("lockfile, canonical and historical changes cannot hide in a successful version command", async (t) => {
  for (const [file, bytes, pattern] of [
    ["pnpm-lock.yaml", "changed", /bound source/],
    ["spec/src/index.md", "changed", /canonical requirements/],
    [
      "CHANGELOG.md",
      "# Visual Delta\n\n## 0.1.6\n\nOld entry removed.\n",
      /historical changelog/,
    ],
  ]) {
    const f = await fixture(t);
    await writeFile(path.join(f.root, file), bytes);
    await assert.rejects(f.run(), pattern);
  }
});
