import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readFile,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  guardVersioningInputs,
  validateRuntimeContracts,
} from "./versioning-runtime.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function fixture(t, version = "2.31.1") {
  const parent = await mkdtemp(path.join(tmpdir(), "lapis-node-versioning-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "project"),
    folder = path.join(root, "node_modules/@changesets/cli");
  await mkdir(folder, { recursive: true });
  await mkdir(path.join(root, ".changeset"));
  await mkdir(path.join(root, "scripts"));
  const bin = "#!/usr/bin/env node\nconsole.log('fixture');\n",
    config = '{"changelog":"@changesets/cli/changelog"}\n',
    recipe = "console.log('source-owned recipe');\n";
  const pkg = JSON.stringify({
    name: "@changesets/cli",
    version,
    bin: { changeset: "bin.js" },
  });
  for (const [file, bytes] of [
    ["bin.js", bin],
    ["package.json", pkg],
  ])
    await writeFile(path.join(folder, file), bytes);
  await writeFile(path.join(root, ".changeset/config.json"), config);
  await writeFile(path.join(root, "scripts/version.mjs"), recipe);
  const scripts = { "release:version": "node scripts/version.mjs" };
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ packageManager: "pnpm@10.34.5", scripts }),
  );
  const contracts = {
    schemaVersion: 1,
    nodeMajor: 24,
    versions: {
      [version]: {
        engines: null,
        integrity: "sha512-" + "A".repeat(86) + "==",
        sourceSha: "a".repeat(40),
        files: { "bin.js": hash(bin), "package.json": hash(pkg) },
      },
    },
  };
  const qualification = {
    schemaVersion: 1,
    cliVersion: version,
    packageManager: "pnpm@10.34.5",
    configSha256: hash(config),
    scripts,
    files: { "scripts/version.mjs": hash(recipe) },
  };
  return { parent, root, folder, contracts, qualification };
}
test("source-bound guard accepts both reviewed CLI majors without running a recipe", async (t) => {
  for (const version of ["2.31.1", "3.0.3"]) {
    const f = await fixture(t, version);
    validateRuntimeContracts(f.contracts);
    assert.equal(
      (
        await guardVersioningInputs(
          f.root,
          f.qualification,
          f.contracts,
          "24.15.0",
        )
      ).version,
      version,
    );
  }
});
test("runtime, CLI bytes/config/recipe changes and unsafe paths reject", async (t) => {
  const f = await fixture(t);
  const run = (qualification = f.qualification, node = "24.15.0") =>
    guardVersioningInputs(f.root, qualification, f.contracts, node);
  await assert.rejects(run(undefined, "26.0.0"), /Node 24/);
  await assert.rejects(
    run({ ...f.qualification, cliVersion: "9.0.0" }),
    /reviewed/,
  );
  await assert.rejects(
    run({ ...f.qualification, files: { "../outside": hash("x") } }),
    /path/,
  );
  await assert.rejects(
    run({ ...f.qualification, configSha256: hash("changed") }),
    /configuration/,
  );
  await assert.rejects(
    run({
      ...f.qualification,
      scripts: { "release:version": "deno run version.ts" },
    }),
    /recipe/,
  );
  await writeFile(path.join(f.root, "scripts/version.mjs"), "changed");
  await assert.rejects(run(), /recipe/);
  await writeFile(
    path.join(f.root, "scripts/version.mjs"),
    "console.log('source-owned recipe');\n",
  );
  await writeFile(path.join(f.folder, "bin.js"), "#!/usr/bin/env deno\n");
  await assert.rejects(run(), /bytes/);
});
test("Deno formatter declarations in source or ancestry hold without replacing formatters", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.parent, "deno.jsonc"), "{}");
  await assert.rejects(
    guardVersioningInputs(f.root, f.qualification, f.contracts, "24.15.0"),
    /Deno formatter/,
  );
});

test("source-owned lifecycle and extra executable changes cannot bypass the bound recipe", async (t) => {
  const f = await fixture(t),
    file = path.join(f.root, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.scripts["postrelease:version"] = "deno task hidden";
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(
    guardVersioningInputs(f.root, f.qualification, f.contracts, "24.15.0"),
    /lifecycle/,
  );
  delete manifest.scripts["postrelease:version"];
  await writeFile(file, JSON.stringify(manifest));
  await writeFile(
    path.join(f.folder, "unexpected.mjs"),
    "console.log('extra');",
  );
  await assert.rejects(
    guardVersioningInputs(f.root, f.qualification, f.contracts, "24.15.0"),
    /bytes/,
  );
  await rm(path.join(f.folder, "unexpected.mjs"));
  await writeFile(path.join(f.parent, "outside"), "outside-source");
  await rm(path.join(f.root, "scripts/version.mjs"));
  await symlink(
    path.join(f.parent, "outside"),
    path.join(f.root, "scripts/version.mjs"),
  );
  await assert.rejects(
    guardVersioningInputs(f.root, f.qualification, f.contracts, "24.15.0"),
    /escapes/,
  );
});

test("reviewed stock data and hosted genuine-source proof retain read-only authority", async () => {
  const contracts = JSON.parse(
    await readFile(
      new URL("../changesets-runtime.json", import.meta.url),
      "utf8",
    ),
  );
  validateRuntimeContracts(contracts);
  assert.deepEqual(Object.keys(contracts.versions), ["2.31.1", "3.0.3"]);
  assert.equal(Object.keys(contracts.versions["2.31.1"].files).length, 13);
  assert.equal(Object.keys(contracts.versions["3.0.3"].files).length, 23);
  const cases = JSON.parse(
      await readFile(
        new URL("../version-recipe-cases.json", import.meta.url),
        "utf8",
      ),
    ),
    example = cases.cases["plugins-changesets2"];
  assert.equal(
    example.qualification.scripts["release:version"],
    "node scripts/version-public-packages.mjs",
  );
  assert.equal(example.pending.path, ".changeset/quiet-remotes-keyboard.md");
  const workflow = await readFile(
    new URL("../.github/workflows/qualify-version-recipe.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
  assert(workflow.includes(`ref: ${example.sourceSha}`));
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github.token \}\}/);
  assert.doesNotMatch(
    workflow,
    /create-github-app-token|contents: write|pull-requests: write|secrets\./,
  );
  for (const line of workflow.split("\n").filter((l) => l.includes("uses:")))
    assert.match(line, /@[a-f0-9]{40}/);
  const proof = await readFile(
    new URL("./qualify-version-recipe.mjs", import.meta.url),
    "utf8",
  );
  assert.match(proof, /run\(\["release:version"\],\s*env\)/);
  assert.doesNotMatch(proof, /npm publish|pnpm publish|release:publish/);
});
