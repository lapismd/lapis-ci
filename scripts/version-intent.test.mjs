import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hasVersionIntent, inspectVersionIntent } from "./version-intent.mjs";

const manifests = [
  { name: "public", oldVersion: "1.0.0" },
  { name: "private", oldVersion: "0.0.0" },
];
const semver = {
  valid: (v) => (/^\d+\.\d+\.\d+$/.test(v) ? v : null),
  gt: (a, b) => a.localeCompare(b, undefined, { numeric: true }) > 0,
};
const release = {
  name: "public",
  type: "patch",
  oldVersion: "1.0.0",
  newVersion: "1.0.1",
};
const plan = (releases = []) => ({ changesets: [], releases });

test("an empty maintenance note has no release intent, while actual workspace rewrites do", () => {
  assert.equal(
    hasVersionIntent(
      plan(),
      [...manifests, { name: "unversioned-root" }],
      semver,
    ),
    false,
  );
  assert.equal(
    hasVersionIntent(
      {
        changesets: [
          { id: "maintenance", releases: [], summary: "Tooling only." },
        ],
        releases: [],
      },
      manifests,
      semver,
    ),
    false,
  );
  assert.equal(hasVersionIntent(plan([release]), manifests, semver), true);
  assert.equal(
    hasVersionIntent(
      plan([
        {
          name: "private",
          type: "none",
          oldVersion: "0.0.0",
          newVersion: "0.0.0",
        },
      ]),
      manifests,
      semver,
    ),
    true,
  );
});

test("missing, malformed, foreign, duplicate or nonadvancing plans fail closed", () => {
  for (const value of [
    null,
    {},
    { changesets: [], releases: null },
    { changesets: [null], releases: [] },
    {
      changesets: [{ id: "broken", summary: "missing release array" }],
      releases: [],
    },
    plan([null]),
    plan([{ ...release, name: "foreign" }]),
    plan([release, release]),
    plan([{ ...release, oldVersion: "0.9.0" }]),
    plan([{ ...release, newVersion: "1.0.0" }]),
    plan([{ ...release, newVersion: "0.9.0" }]),
    plan([{ ...release, type: "snapshot" }]),
    plan([{ ...release, type: "none" }]),
  ])
    assert.throws(() => hasVersionIntent(value, manifests, semver));
});

test("linked alignment is limited to the actual configured source group", () => {
  const inventory = [...manifests, { name: "linked", oldVersion: "1.2.0" }];
  const aligned = plan([
    { ...release, oldVersion: "1.2.0", newVersion: "1.2.1" },
  ]);
  assert.throws(() => hasVersionIntent(aligned, inventory, semver));
  assert.equal(
    hasVersionIntent(aligned, inventory, semver, {
      linked: [["public", "linked"]],
    }),
    true,
  );
  assert.equal(
    hasVersionIntent(aligned, inventory, semver, {
      fixed: [["public", "linked"]],
    }),
    true,
  );
  assert.throws(() =>
    hasVersionIntent(aligned, inventory, semver, {
      linked: [["public", "foreign"]],
    }),
  );
});

// Opt-in actual frozen consumer installations; the dependency-free default suite
// above does not pretend to provide a real Changesets CLI qualification.
for (const cliRoot of (process.env.LAPIS_VERSION_INTENT_CLI_ROOTS ?? "")
  .split(path.delimiter)
  .filter(Boolean)) {
  test(`actual installed CLI in ${path.basename(cliRoot)} preserves standalone and workspace intent`, async (t) => {
    const temporary = await mkdtemp(
      path.join(tmpdir(), "lapis-intent-actual-"),
    );
    t.after(() => rm(temporary, { recursive: true, force: true }));
    for (const workspace of [false, true]) {
      const root = path.join(temporary, workspace ? "workspace" : "standalone");
      await mkdir(path.join(root, ".changeset"), { recursive: true });
      await mkdir(path.join(root, "node_modules/@changesets"), {
        recursive: true,
      });
      await symlink(
        path.join(cliRoot, "node_modules/@changesets/cli"),
        path.join(root, "node_modules/@changesets/cli"),
      );
      const config = {
        changelog: false,
        commit: false,
        fixed: [],
        linked: [],
        access: "public",
        baseBranch: "main",
        updateInternalDependencies: "patch",
        ignore: [],
        privatePackages: { version: false, tag: false },
      };
      await writeFile(
        path.join(root, ".changeset/config.json"),
        JSON.stringify(config),
      );
      const files = {
        "package.json": workspace
          ? {
              name: "root",
              private: true,
              version: "0.0.0",
              workspaces: ["packages/*"],
            }
          : { name: "public", version: "1.0.0" },
        ...(workspace
          ? {
              "packages/public/package.json": {
                name: "public",
                version: "1.0.0",
              },
              "packages/private/package.json": {
                name: "private",
                private: true,
                version: "0.0.0",
                dependencies: { public: "workspace:*" },
              },
            }
          : {}),
      };
      for (const [file, value] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await writeFile(path.join(root, file), JSON.stringify(value));
      }
      if (workspace)
        await writeFile(
          path.join(root, "pnpm-workspace.yaml"),
          "packages:\n  - packages/*\n",
        );
      await writeFile(path.join(root, ".gitignore"), "node_modules/\n");
      const jj = (args) =>
        execFileSync(
          "jj",
          [
            "--config",
            "signing.behavior=drop",
            "--config",
            'user.name="Intent qualification"',
            "--config",
            'user.email="fixture@example.invalid"',
            ...args,
          ],
          { cwd: root, stdio: "pipe" },
        );
      jj(["git", "init", "--colocate"]);
      jj(["commit", "-m", "Read-only release intent qualification"]);
      jj(["bookmark", "create", "main", "-r", "@-"]);
      assert.equal(await inspectVersionIntent(root), false);
      const empty = "---\n---\n\nMaintenance only.\n";
      const genuine = '---\n"public": patch\n---\n\nGenuine patch.\n';
      await writeFile(path.join(root, ".changeset/maintenance.md"), empty);
      assert.equal(await inspectVersionIntent(root), false);
      await writeFile(path.join(root, ".changeset/product.md"), genuine);
      assert.equal(await inspectVersionIntent(root), true);
      assert.equal(
        await readFile(path.join(root, ".changeset/maintenance.md"), "utf8"),
        empty,
      );
      assert.equal(
        await readFile(path.join(root, ".changeset/product.md"), "utf8"),
        genuine,
      );
      for (const [file, value] of Object.entries(files))
        assert.deepEqual(
          JSON.parse(await readFile(path.join(root, file), "utf8")),
          value,
        );
      await writeFile(
        path.join(root, ".changeset/product.md"),
        genuine.replace('"public"', '"foreign"'),
      );
      await assert.rejects(inspectVersionIntent(root));
      await writeFile(path.join(root, ".changeset/config.json"), "invalid");
      await assert.rejects(inspectVersionIntent(root));
    }
  });
}
