import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  snapshotAiRecipeOutputs,
  verifyAiRecipeOutputs,
} from "./ai-version-recipe-outputs.mjs";

const cases = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const example = cases.cases["ai-changesets2-native"];
const releases = [
  { name: "@lapismd/lapis-ai", oldVersion: "0.2.0", newVersion: "0.3.0" },
];

// These unit controls exercise parsed metadata independently of the external
// TOML parser. Actual qualification resolves @iarna/toml from the frozen source.
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "ai-native-outputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const save = async (file, value) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(
      path.join(root, file),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const get = async (file) =>
    JSON.parse(await readFile(path.join(root, file), "utf8"));
  for (const file of [
    "spec/src/current/contracts/release.md",
    "spec/src/current/progress/milestones.md",
  ])
    await save(file, "Unchanged canonical source evidence.\n");
  const members = Array.from(
    { length: 15 },
    (_, index) => `crates/owned-${index}`,
  );
  for (const directory of members)
    await save(`${directory}/Cargo.toml`, {
      package: { name: path.basename(directory), version: { workspace: true } },
    });
  async function prepare(version) {
    await save("package.json", {
      name: "@lapismd/lapis-ai",
      private: true,
      version,
    });
    await save("packages/ai/package.json", {
      name: "@lapismd/ai",
      private: true,
      version,
    });
    await save("Cargo.toml", {
      workspace: {
        package: { version },
        members,
        dependencies: Object.fromEntries(
          members.map((directory) => [
            path.basename(directory),
            { path: directory, version },
          ]),
        ),
      },
    });
    await save("Cargo.lock", {
      package: members.map((directory) => ({
        name: path.basename(directory),
        version,
      })),
    });
    await save("pnpm-lock.yaml", "Unchanged locked dependency graph.\n");
    await save("CHANGELOG.md", `# Coordinator\n\n## ${version}\n`);
    await save(
      "packages/ai/CHANGELOG.md",
      `# Private client\n\n## ${version}\n`,
    );
    for (const file of [
      "README.md",
      ...members.map((directory) => `${directory}/README.md`),
    ])
      await save(file, `cargo install example --version ${version} --locked\n`);
  }
  await prepare("0.2.0");
  const before = await snapshotAiRecipeOutputs(
    root,
    example,
    releases,
    JSON.parse,
  );
  await prepare("0.3.0");
  const changes = Object.keys(before.hashes)
    .filter((file) => file !== "pnpm-lock.yaml")
    .concat(Object.keys(before.readmes));
  const verify = (changed = changes, untracked = []) =>
    verifyAiRecipeOutputs(
      root,
      example,
      releases,
      before,
      changed,
      untracked,
      JSON.parse,
    );
  return { root, before, save, get, changes, verify };
}

test("AI receipts require both private versions, all15 Cargo records and retained evidence", async (t) => {
  const f = await fixture(t),
    after = await f.verify();
  assert.equal(after.version, "0.3.0");
  assert.equal(after.packages.length, 15);
  assert(after.packages.every((pkg) => pkg.version === "0.3.0"));
  assert.equal(Object.keys(after.readmes).length, 16);
  assert.deepEqual(after.canonical, f.before.canonical);
});

test("partial native mutations, evidence edits and unexpected outputs cannot qualify", async (t) => {
  const controls = {
    client: async (f) =>
      f.save("packages/ai/package.json", {
        name: "@lapismd/ai",
        private: true,
        version: "0.2.0",
      }),
    privateBoundary: async (f) =>
      f.save("packages/ai/package.json", {
        name: "@lapismd/ai",
        private: false,
        version: "0.3.0",
      }),
    lock: async (f) => {
      const lock = await f.get("Cargo.lock");
      lock.package[14].version = "0.2.0";
      await f.save("Cargo.lock", lock);
    },
    internalRange: async (f) => {
      const cargo = await f.get("Cargo.toml");
      cargo.workspace.dependencies["owned-14"].version = "0.2.0";
      await f.save("Cargo.toml", cargo);
    },
    changelog: async (f) =>
      f.save("packages/ai/CHANGELOG.md", "# Private client\n\n## 0.2.0\n"),
    readme: async (f) =>
      f.save(
        "crates/owned-14/README.md",
        "cargo install example --version 0.2.0 --locked\n",
      ),
    canonical: async (f) =>
      f.save(
        "spec/src/current/contracts/release.md",
        "Fabricated qualification evidence.\n",
      ),
    addedCanonical: async (f) =>
      f.save("spec/src/new.md", "New unreviewed requirement.\n"),
  };
  for (const [name, mutate] of Object.entries(controls))
    await t.test(name, async (t) => {
      const f = await fixture(t);
      await mutate(f);
      await assert.rejects(f.verify());
    });
  const f = await fixture(t);
  await assert.rejects(
    f.verify([...f.changes, "scripts/publish.mjs"]),
    /unreviewed source output/,
  );
  await assert.rejects(
    f.verify(f.changes, ["unreviewed.mjs"]),
    /unreviewed source file/,
  );
});
