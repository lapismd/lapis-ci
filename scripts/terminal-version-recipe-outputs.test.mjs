import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  snapshotTerminalRecipeOutputs,
  verifyTerminalRecipeOutputs,
} from "./terminal-version-recipe-outputs.mjs";

const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const releases = [
  { name: "@lapismd/terminal", oldVersion: "0.1.2", newVersion: "0.1.3" },
];
const directories = [
  "crates/lapis-terminal-engine",
  "crates/lapis-terminal-runtime",
  "crates/tauri-plugin-lapis-terminal",
  "examples/desktop/src-tauri",
];
const names = [
  "lapis-terminal-engine",
  "lapis-terminal-runtime",
  "tauri-plugin-lapis-terminal",
  "lapis-terminal-demo",
];
const chapter = "spec/src/current/contracts/release.md",
  summary = "spec/src/SUMMARY.md",
  evidence = "spec/src/history/releases/0.1.3.md";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "terminal-recipe-output-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const example = structuredClone(data.cases["terminal-changesets2-native"]);
  const record = "# Prepared release 0.1.3\n\nMetadata preparation only.\n";
  example.releaseRecordSha256 = createHash("sha256")
    .update(record)
    .digest("hex");
  const save = async (file, value) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(
      path.join(root, file),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const coordinated = async (version) => {
    await save("Cargo.toml", {
      workspace: { package: { version }, members: directories },
    });
    await save("Cargo.lock", {
      package: names.map((name) => ({ name, version })),
    });
    for (const [index, directory] of directories.entries())
      await save(`${directory}/Cargo.toml`, {
        package: { name: names[index], version: { workspace: true } },
        dependencies: index
          ? { [names[0]]: { path: "../lapis-terminal-engine", version } }
          : {},
      });
    await save("packages/terminal/package.json", {
      name: releases[0].name,
      version,
      publishConfig: { access: "public" },
    });
    await save(
      "packages/terminal/CHANGELOG.md",
      `# @lapismd/terminal\n\n## ${version}\n`,
    );
    await save(
      "examples/desktop/CHANGELOG.md",
      `# @lapismd/terminal-demo\n\n## ${version}\n`,
    );
    for (const file of ["package.json", "examples/desktop/package.json"])
      await save(file, { private: true, version });
    await save("examples/desktop/src-tauri/tauri.conf.json", { version });
    await save("pnpm-lock.yaml", "unchanged lock\n");
    await save(chapter, `# Release\n\nPrepared version: **${version}**.\n`);
  };
  await coordinated("0.1.2");
  await save(summary, "# Summary\n");
  await save("spec/src/current/behavior.md", "Existing runtime evidence\n");
  const before = await snapshotTerminalRecipeOutputs(
    root,
    example,
    releases,
    JSON.parse,
  );
  await coordinated("0.1.3");
  await save(
    summary,
    "# Summary\n- [Prepared release 0.1.3](history/releases/0.1.3.md)\n",
  );
  await save(evidence, record);
  const changed = [...Object.keys(before.hashes), chapter, summary];
  const verify = (changes = changed, untracked = [evidence]) =>
    verifyTerminalRecipeOutputs(
      root,
      example,
      releases,
      before,
      changes,
      untracked,
      JSON.parse,
    );
  return { root, save, verify, before, example, changed };
}

test("Terminal receipts bind npm/private/Tauri, four Cargo records and exact metadata-only canonical outputs", async (t) => {
  const f = await fixture(t),
    after = await f.verify();
  assert.equal(after.version, "0.1.3");
  assert.equal(after.packages.length, 4);
  assert.equal(after.canonical[evidence], f.example.releaseRecordSha256);
});

test("partial native mutations, invented evidence and unreviewed outputs cannot qualify", async (t) => {
  const mutations = {
    privateVersion: async (f) =>
      f.save("package.json", { private: true, version: "0.1.2" }),
    privateBoundary: async (f) =>
      f.save("examples/desktop/package.json", {
        private: false,
        version: "0.1.3",
      }),
    publicBoundary: async (f) =>
      f.save("packages/terminal/package.json", {
        name: releases[0].name,
        version: "0.1.3",
        publishConfig: { access: "restricted" },
      }),
    tauri: async (f) =>
      f.save("examples/desktop/src-tauri/tauri.conf.json", {
        version: "0.1.2",
      }),
    lock: async (f) =>
      f.save("Cargo.lock", {
        package: names.map((name, index) => ({
          name,
          version: index ? "0.1.3" : "0.1.2",
        })),
      }),
    duplicateLock: async (f) =>
      f.save("Cargo.lock", {
        package: [
          ...names.map((name) => ({ name, version: "0.1.3" })),
          { name: names[0], version: "0.1.3" },
        ],
      }),
    member: async (f) =>
      f.save("Cargo.toml", {
        workspace: {
          package: { version: "0.1.3" },
          members: directories.slice(0, 3),
        },
      }),
    internalRange: async (f) =>
      f.save(`${directories[1]}/Cargo.toml`, {
        package: { name: names[1], version: { workspace: true } },
        dependencies: { [names[0]]: { version: "0.1.2" } },
      }),
    changelog: async (f) =>
      f.save(
        "packages/terminal/CHANGELOG.md",
        "# @lapismd/terminal\n\n## 0.1.2\n",
      ),
    chapter: async (f) =>
      f.save(
        chapter,
        "# Release\n\nPrepared version: **0.1.3**.\n\nAll functional tests passed.\n",
      ),
    summary: async (f) =>
      f.save(summary, "# Summary\n- [Invented](history/releases/0.1.3.md)\n"),
    record: async (f) =>
      f.save(
        evidence,
        "# Prepared release 0.1.3\n\nAll native acceptance passed.\n",
      ),
    canonical: async (f) =>
      f.save("spec/src/current/behavior.md", "Fabricated runtime evidence\n"),
    addedCanonical: async (f) =>
      f.save("spec/src/current/new.md", "Unexpected canonical evidence\n"),
  };
  for (const [name, mutate] of Object.entries(mutations))
    await t.test(name, async (t) => {
      const f = await fixture(t);
      await mutate(f);
      await assert.rejects(f.verify());
    });
  const f = await fixture(t);
  await assert.rejects(
    f.verify([...f.changed, "scripts/unreviewed.mjs"]),
    /unreviewed output/,
  );
  await assert.rejects(
    f.verify(f.changed, [evidence, "unreviewed.txt"]),
    /unreviewed source file/,
  );
  f.before.canonical[evidence] = f.example.releaseRecordSha256;
  await assert.rejects(f.verify(), /must be new/);
});
