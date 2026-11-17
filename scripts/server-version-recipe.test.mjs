import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { selectRecipeCase } from "./version-recipe-layout.mjs";
import {
  assertServerRecipePlan,
  snapshotServerRecipe,
  verifyServerRecipeOutputs,
} from "./server-version-recipe.mjs";

const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);

test("Server qualifies its genuine private minor release through the unchanged Node recipe", () => {
  const selected = selectRecipeCase(data, "server-changesets3");
  assert.equal(selected.repository, "lapismd/lapis-server");
  assert.equal(selected.sourceSha, "78a3fe6f84b008af6ef11242c352a33b146e2caa");
  assert.equal(selected.privateRootContract, "server-private-root-v1");
  assert.equal(selected.qualification.packageManager, "pnpm@10.34.5");
  assert.deepEqual(selected.expectedReleases, [
    { name: "@lapismd/lapis-server", oldVersion: "2.3.0", newVersion: "2.4.0" },
  ]);
  assert.equal(selected.pendingNotes.length, 2);
  assert.equal(selected.historicalNoteSourceSha, undefined);
});

const selected = data.cases["server-changesets3"];
for (const [name, mutate] of [
  ["missing private contract", (s) => delete s.privateRootContract],
  [
    "another repository",
    (s) => {
      s.repository = "lapismd/design-core";
    },
  ],
  [
    "Deno runtime profile",
    (s) => {
      s.profile = "deno";
    },
  ],
  [
    "different package manager",
    (s) => {
      s.qualification.packageManager = "pnpm@10.32.1";
    },
  ],
  [
    "changed version recipe",
    (s) => {
      s.qualification.scripts["release:version"] += " && pnpm publish";
    },
  ],
  [
    "missing publication helper binding",
    (s) => {
      delete s.closureEvidence.sourceHashes["scripts/release-github.mjs"];
    },
  ],
  [
    "missing audit decision binding",
    (s) => {
      delete s.closureEvidence.sourceHashes[
        "spec/records/2026-11-16-katex-audit-exception.md"
      ];
    },
  ],
  [
    "different current source",
    (s) => {
      s.closureEvidence.currentSourceSha = "a".repeat(40);
    },
  ],
  ["missing genuine note", (s) => s.pendingNotes.pop()],
  [
    "fabricated patch plan",
    (s) => {
      s.expectedReleases[0].newVersion = "2.3.1";
    },
  ],
  [
    "historical replacement note",
    (s) => {
      s.historicalNoteSourceSha = "a".repeat(40);
    },
  ],
]) {
  test("Server dispatch rejects " + name, () => {
    const example = structuredClone(selected);
    mutate(example);
    assert.throws(() =>
      selectRecipeCase(
        { schemaVersion: 1, cases: { server: example } },
        "server",
      ),
    );
  });
}

test("Server rejects an extra or different private release plan", () => {
  for (const releases of [
    [{ ...selected.expectedReleases[0], newVersion: "3.0.0" }],
    [
      ...selected.expectedReleases,
      { name: "other", oldVersion: "1.0.0", newVersion: "1.0.1" },
    ],
  ])
    assert.throws(
      () => assertServerRecipePlan(selected, releases),
      /Server plan differs/,
    );
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "server-private-recipe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const example = structuredClone(selected);
  const pkg = {
    name: "@lapismd/lapis-server",
    private: true,
    version: "2.3.0",
    dependencies: { "@lapis-notes/language-service": "^0.1.6" },
    pnpm: { auditConfig: { ignoreCves: ["CVE-2026-103923"] } },
  };
  const files = {
    "package.json": JSON.stringify(pkg),
    "pnpm-lock.yaml": JSON.stringify({
      lockfileVersion: "9.0",
      packages: { reviewed: { integrity: "sha512-unchanged" } },
    }),
    ".changeset/config.json": JSON.stringify({
      privatePackages: { version: true, tag: true },
    }),
    "CHANGELOG.md": "# Server\n\n## 2.3.0\nPrevious release.\n",
  };
  for (const [index, note] of example.pendingNotes.entries()) {
    files[note.path] =
      `---\n"@lapismd/lapis-server": ${index ? "patch" : "minor"}\n---\n\nReviewed fixture note ${index}.\n`;
    note.sha256 = createHash("sha256").update(files[note.path]).digest("hex");
    example.closureEvidence.sourceHashes[note.path] = note.sha256;
    example.closureEvidence.currentHashes[note.path] = note.sha256;
  }
  example.pending = example.pendingNotes[0];
  const write = async (file, value) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), value);
  };
  for (const file of Object.keys(example.closureEvidence.sourceHashes))
    await write(file, files[file] ?? "reviewed stable source: " + file);
  const releases = example.expectedReleases;
  const before = await snapshotServerRecipe(
    root,
    example,
    releases,
    JSON.parse,
  );
  pkg.version = "2.4.0";
  await write("package.json", JSON.stringify(pkg));
  await write(
    "CHANGELOG.md",
    "# Server\n\n## 2.4.0\nReviewed fixture notes.\n\n## 2.3.0\nPrevious release.\n",
  );
  for (const note of example.pendingNotes) await rm(path.join(root, note.path));
  const changes = [
    "package.json",
    "CHANGELOG.md",
    ...example.pendingNotes.map((note) => note.path),
  ];
  return {
    write,
    pkg,
    example,
    before,
    changes,
    verify: (paths = changes, untracked = []) =>
      verifyServerRecipeOutputs(
        root,
        example,
        releases,
        before,
        paths,
        untracked,
        JSON.parse,
      ),
  };
}

test("Server accepts only its genuine private version/changelog mutation with stable source and dependency graph", async (t) => {
  const f = await fixture(t);
  const result = await f.verify();
  assert.equal(result.packageVersion, "2.4.0");
  assert(
    result.privatePackageUnchanged &&
      result.lockGraphUnchanged &&
      result.dependencyAndAuditPolicyUnchanged,
  );
  assert.equal(result.genuineNotesConsumed.length, 2);
});

for (const [name, mutate, message] of [
  [
    "private publication boundary",
    async (f) => {
      f.pkg.private = false;
      await f.write("package.json", JSON.stringify(f.pkg));
    },
    /remain private/,
  ],
  [
    "dependency ranges",
    async (f) => {
      f.pkg.dependencies["@lapis-notes/language-service"] = "*";
      await f.write("package.json", JSON.stringify(f.pkg));
    },
    /manifest, dependency and audit policy/,
  ],
  [
    "audit exception expansion",
    async (f) => {
      f.pkg.pnpm.auditConfig.ignoreCves.push("OTHER");
      await f.write("package.json", JSON.stringify(f.pkg));
    },
    /manifest, dependency and audit policy/,
  ],
  [
    "lockfile graph",
    (f) => f.write("pnpm-lock.yaml", '{"packages":{}}'),
    /lock graph changed/,
  ],
  [
    "Rust lock",
    (f) => f.write("Cargo.lock", "changed"),
    /source\/configuration changed/,
  ],
  [
    "publication workflow",
    (f) => f.write(".github/workflows/release.yml", "changed"),
    /source\/configuration changed/,
  ],
  [
    "GitHub publication helper",
    (f) => f.write("scripts/release-github.mjs", "changed"),
    /source\/configuration changed/,
  ],
  [
    "audit decision",
    (f) =>
      f.write(
        "spec/records/2026-11-16-katex-audit-exception.md",
        "expanded scope",
      ),
    /source\/configuration changed/,
  ],
  [
    "formatter configuration",
    (f) => f.write(".prettierrc.json", "{}"),
    /source\/configuration changed/,
  ],
  [
    "unconsumed source note",
    (f) => f.write(f.example.pending.path, "retained"),
    /not consumed/,
  ],
  [
    "changelog version",
    (f) => f.write("CHANGELOG.md", "# No version\n"),
    /Missing Server changelog/,
  ],
]) {
  test("Server output proof rejects changes to " + name, async (t) => {
    const f = await fixture(t);
    await mutate(f);
    await assert.rejects(f.verify(), message);
  });
}

test("Server rejects unexpected, untracked or missing recipe outputs", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.verify([...f.changes, "web/source.ts"]),
    /Unexpected Server output/,
  );
  await assert.rejects(
    f.verify(f.changes, ["credentials.txt"]),
    /Untracked Server recipe output/,
  );
  await assert.rejects(
    f.verify(f.changes.filter((file) => file !== "package.json")),
    /Missing Server output/,
  );
});
