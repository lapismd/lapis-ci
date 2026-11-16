import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  versionRecipeCommand,
  assertDirectRecipePlan,
} from "./version-recipe-command.mjs";
import { selectRecipeCase } from "./version-recipe-layout.mjs";
import { verifyDirectRecipeOutputs } from "./direct-version-recipe-outputs.mjs";
const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const selected = data.cases["agent-ui-changesets2"];
const direct = () => structuredClone(selected.qualification);
test("default script command remains literal; direct command is a fresh validated argv", () => {
  assert.deepEqual(versionRecipeCommand({}), ["release:version"]);
  assert.deepEqual(versionRecipeCommand({ mode: "script" }), [
    "release:version",
  ]);
  const command = versionRecipeCommand(direct());
  assert.deepEqual(command, ["exec", "changeset", "version"]);
  command.push("publish");
  assert.deepEqual(versionRecipeCommand(direct()), [
    "exec",
    "changeset",
    "version",
  ]);
});
for (const [name, mutate] of Object.entries({
  "unknown mode": (q) => (q.mode = "shell"),
  "empty mode": (q) => (q.mode = ""),
  "null mode": (q) => (q.mode = null),
  "boolean mode": (q) => (q.mode = false),
  "unselected direct argv": (q) => delete q.mode,
  "script mode carrying argv": (q) => (q.mode = "script"),
  "missing argv": (q) => delete q.argv,
  "string command": (q) => (q.argv = "exec changeset version"),
  "empty argv": (q) => (q.argv = []),
  "additional flag": (q) => q.argv.push("--snapshot"),
  publication: (q) => (q.argv[2] = "publish"),
  "wrong tool": (q) => (q.argv[1] = "npm"),
  bootstrap: (q) => (q.argv[0] = "dlx"),
  "shell escape": (q) => (q.argv[2] = "version; publish"),
  "reordered args": (q) => (q.argv = ["changeset", "exec", "version"]),
  "hybrid script binding": (q) =>
    (q.scripts = { "release:version": "changeset version" }),
  "missing scripts contract": (q) => delete q.scripts,
  "other CLI major": (q) => (q.cliVersion = "3.0.3"),
  "other Node profile": (q) => (q.nodeMajor = 22),
}))
  test(`command mode holds ${name}`, () => {
    const q = direct();
    mutate(q);
    assert.throws(() => versionRecipeCommand(q), /command mode or argv/);
  });
test("only the reviewed immutable Agent UI direct profile is selectable", () => {
  assert.equal(selectRecipeCase(data, "agent-ui-changesets2"), selected);
  assert.equal(selected.sourceSha, "60826d6d3910a33d3ea1c686786e690160ff2ff3");
  assert.equal(
    selected.historicalNoteSourceSha,
    "f2cfeceb8d4b1885694f2976a75893183bac4ea8",
  );
  assert.equal(
    selected.pending.sha256,
    "e47b7995f03dbd99bef7e44a7b3689a6ad9d1c2f55da9d915c393855b8847b76",
  );
  assert.deepEqual(
    selected.closureEvidence.sourceHashes,
    selected.closureEvidence.currentHashes,
  );
  assert.equal(Object.keys(selected.closureEvidence.sourceHashes).length, 13);
  for (const [file, hash] of Object.entries(selected.qualification.files))
    assert.equal(hash, selected.closureEvidence.sourceHashes[file]);
  for (const mutate of [
    (s) => (s.repository = "lapismd/design-core"),
    (s) => delete s.closureEvidence,
    (s) => (s.closureEvidence.currentHashes["package.json"] = "f".repeat(64)),
    (s) => delete s.qualification.files["patches/bits-ui@2.20.2.patch"],
    (s) => (s.qualification.configSha256 = "e".repeat(64)),
    (s) => (s.ignorePnpmfile = true),
    (s) => (s.strictPeerDependencies = true),
    (s) => (s.expectedReleases = []),
    (s) => (s.expectedReleases[0].name = "@lapismd/agent-ui"),
    (s) => (s.expectedReleases[0].newVersion = "0.3.0"),
    (s) =>
      (s.afterVersionChecks = [
        ["exec", "node", "scripts/sync-release-versions.mjs", "--check"],
      ]),
  ]) {
    const bad = structuredClone(selected);
    mutate(bad);
    assert.throws(() =>
      selectRecipeCase({ schemaVersion: 1, cases: { bad } }, "bad"),
    );
  }
});
test("direct plan accepts only the reviewed real patch and retains default script cases", () => {
  assertDirectRecipePlan(selected, [
    { ...selected.expectedReleases[0], changelogBefore: "bound" },
  ]);
  assertDirectRecipePlan(data.cases["core-changesets3"], []);
  for (const changes of [
    [],
    [{ ...selected.expectedReleases[0], newVersion: "0.2.8" }],
    [
      ...selected.expectedReleases,
      { name: "@lapismd/agent-ui", oldVersion: "0.2.8", newVersion: "0.2.9" },
    ],
  ])
    assert.throws(
      () => assertDirectRecipePlan(selected, changes),
      /unexpected package/,
    );
});
test("runner uses the validated direct argv and records actual ABI without changing default or install", async () => {
  const source = await readFile(
    new URL("./qualify-version-recipe.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /const versionCommand = versionRecipeCommand\(example.qualification\)/,
  );
  assert.match(
    source,
    /if \(example.qualification.mode === "direct"\) run\(versionCommand, env\)/,
  );
  assert.match(source, /else run\(\["release:version"\], env\)/);
  assert.match(
    source,
    /receipt.command = `pnpm \$\{versionCommand.join\(" "\)\}`/,
  );
  assert.ok(
    source.indexOf("assertDirectRecipePlan(example, changes)") <
      source.indexOf("run(versionCommand, env)"),
  );
  assert.match(
    source,
    /"install",\s*"--frozen-lockfile",\s*"--ignore-scripts"/,
  );
});
test("direct output controls reject unchanged-package, patch, lock and unexpected-path drift", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "direct-version-outcomes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    "package.json": '{"version":"0.1.0"}',
    "packages/agent/package.json": '{"version":"0.2.8"}',
    "packages/repository/package.json": '{"version":"0.2.7"}',
    "pnpm-lock.yaml": "original-lock",
    "patches/approved.patch": "original-patch",
  };
  for (const [file, bytes] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), bytes);
  }
  const example = {
    qualification: { mode: "direct" },
    pending: { path: ".changeset/genuine.md" },
    closureEvidence: {
      sourceHashes: Object.fromEntries(
        Object.entries(files).map(([file, bytes]) => [
          file,
          createHash("sha256").update(bytes).digest("hex"),
        ]),
      ),
    },
  };
  const manifests = [
    {
      name: "root",
      file: path.join(root, "package.json"),
      oldVersion: "0.1.0",
    },
    {
      name: "agent",
      file: path.join(root, "packages/agent/package.json"),
      oldVersion: "0.2.8",
    },
    {
      name: "repository",
      file: path.join(root, "packages/repository/package.json"),
      changelog: path.join(root, "packages/repository/CHANGELOG.md"),
      oldVersion: "0.2.6",
    },
  ];
  const changes = [{ name: "repository", newVersion: "0.2.7" }],
    changed = [
      "packages/repository/package.json",
      "packages/repository/CHANGELOG.md",
      ".changeset/genuine.md",
    ];
  const run = (paths = changed, untracked = []) =>
    verifyDirectRecipeOutputs(
      root,
      example,
      manifests,
      changes,
      paths,
      untracked,
    );
  assert.deepEqual(await run(), {
    root: "0.1.0",
    agent: "0.2.8",
    repository: "0.2.7",
  });
  await assert.rejects(
    run([...changed, "unexpected.mjs"]),
    /unexpected source/,
  );
  await assert.rejects(run(changed, ["unexpected.mjs"]), /unexpected source/);
  for (const [file, bytes] of Object.entries(files)) {
    await writeFile(
      path.join(root, file),
      file.endsWith("json") ? '{"version":"9.0.0"}' : "changed",
    );
    await assert.rejects(run(), /Unexpected direct recipe|changed bound/);
    await writeFile(path.join(root, file), bytes);
  }
});
