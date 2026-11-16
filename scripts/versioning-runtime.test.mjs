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
  guardVersioningWithIntent,
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
test("release intent is opt-in and cannot run before qualified input acceptance", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const inspect = async () => {
    calls++;
    return false;
  };
  const run = (q = f.qualification, enabled = false) =>
    guardVersioningWithIntent(
      f.root,
      q,
      f.contracts,
      enabled,
      "24.15.0",
      inspect,
    );
  assert.equal((await run()).hasChangesets, undefined);
  assert.equal(calls, 0);
  assert.equal((await run(f.qualification, true)).hasChangesets, false);
  assert.equal(calls, 1);
  await assert.rejects(
    run({ ...f.qualification, cliVersion: "9.0.0" }, true),
    /reviewed/,
  );
  assert.equal(calls, 1);
  await assert.rejects(run(f.qualification, "true"), /flag/);
});

test("planner errors, nonboolean results and source drift never admit publication", async (t) => {
  const f = await fixture(t);
  const run = (inspect) =>
    guardVersioningWithIntent(
      f.root,
      f.qualification,
      f.contracts,
      true,
      "24.15.0",
      inspect,
    );
  await assert.rejects(
    run(async () => {
      throw Error("status failed");
    }),
    /status failed/,
  );
  await assert.rejects(
    run(async () => undefined),
    /intent result/,
  );
  assert.equal((await run(async () => true)).hasChangesets, true);
  await assert.rejects(
    run(async () => {
      await writeFile(
        path.join(f.root, "scripts/version.mjs"),
        "changed during planning",
      );
      return false;
    }),
    /source bytes changed/,
  );
});
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
test("Node22 requires an explicitly reviewed CLI pair and source binding", async (t) => {
  const f = await fixture(t);
  f.contracts.versions["2.31.1"].nodeMajors = [22, 24];
  const selected = { ...f.qualification, nodeMajor: 22 };
  assert.equal(
    (await guardVersioningInputs(f.root, selected, f.contracts, "22.23.5"))
      .node,
    "22.23.5",
  );
  await assert.rejects(
    guardVersioningInputs(f.root, f.qualification, f.contracts, "22.23.5"),
    /Node 24/,
  );
  await assert.rejects(
    guardVersioningInputs(f.root, selected, f.contracts, "24.15.0"),
    /Node 22/,
  );
  delete f.contracts.versions["2.31.1"].nodeMajors;
  await assert.rejects(
    guardVersioningInputs(f.root, selected, f.contracts, "22.23.5"),
    /reviewed Node/,
  );
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

test("unconfigured formatter policy holds new source and ancestor inputs", async (t) => {
  const f = await fixture(t);
  const qualification = { ...f.qualification, formatterPolicy: "unconfigured" };
  const run = () =>
    guardVersioningInputs(f.root, qualification, f.contracts, "24.15.0");
  await run();
  for (const directory of [f.root, f.parent]) {
    for (const file of [
      ".prettierrc",
      "prettier.config.mts",
      ".editorconfig",
      ".prettierignore",
    ]) {
      await writeFile(path.join(directory, file), "{}");
      await assert.rejects(run(), /formatter/);
      await rm(path.join(directory, file));
    }
    const file = path.join(directory, "package.json");
    const original = await readFile(file).catch(() => null);
    await writeFile(
      file,
      JSON.stringify({
        ...(original ? JSON.parse(original) : {}),
        prettier: {},
      }),
    );
    await assert.rejects(run(), /formatter/);
    if (original) await writeFile(file, original);
    else await rm(file);
  }
  await symlink(
    path.join(f.parent, "absent"),
    path.join(f.root, ".prettierrc"),
  );
  await assert.rejects(run(), /formatter/);
  await assert.rejects(
    guardVersioningInputs(
      f.root,
      { ...qualification, formatterPolicy: "ignore" },
      f.contracts,
      "24.15.0",
    ),
    /formatter/,
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
  assert(workflow.includes("ref: ${{ steps.recipe.outputs.source }}"));
  assert(
    workflow.includes("repository: ${{ steps.recipe.outputs.repository }}"),
  );
  assert(
    workflow.includes("run: node guard/scripts/select-version-recipe.mjs"),
  );
  assert(workflow.includes("RECIPE_CASE: ${{ inputs.case }}"));
  for (const name of Object.keys(cases.cases))
    assert(workflow.includes(`- ${name}`));
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

test("literal direct Changesets version accepts CLI2 without a consumer release wrapper", async (t) => {
  const f = await fixture(t);
  await writeFile(
    path.join(f.root, "package.json"),
    JSON.stringify({ packageManager: "pnpm@10.34.5", scripts: {} }),
  );
  const qualification = {
    ...f.qualification,
    mode: "direct",
    argv: ["exec", "changeset", "version"],
    scripts: {},
  };
  const result = await guardVersioningInputs(
    f.root,
    qualification,
    f.contracts,
    "24.15.0",
  );
  assert.equal(result.version, "2.31.1");
  assert.equal(result.recipe, "source-bound-inputs");
});

test("direct mode retains formatter, patch, config and installed-byte qualification", async (t) => {
  const f = await fixture(t),
    q = {
      ...f.qualification,
      mode: "direct",
      argv: ["exec", "changeset", "version"],
      scripts: {},
    };
  await writeFile(
    path.join(f.root, "package.json"),
    JSON.stringify({ packageManager: q.packageManager, scripts: {} }),
  );
  const run = (value = q) =>
    guardVersioningInputs(f.root, value, f.contracts, "24.15.0");
  assert.equal((await run()).version, "2.31.1");
  await assert.rejects(
    run({ ...q, files: {} }),
    /qualification path or binding/,
  );
  await assert.rejects(
    run({ ...q, configSha256: hash("changed") }),
    /configuration changed/,
  );
  await assert.rejects(
    run({ ...q, mode: undefined, argv: undefined }),
    /qualification path or binding/,
  );
  await writeFile(
    path.join(f.root, "scripts/version.mjs"),
    "changed bound input",
  );
  await assert.rejects(run(), /source bytes changed/);
});

test("literal @ patch filename remains source-bound in direct mode", async (t) => {
  const f = await fixture(t),
    file = "patches/bits-ui@2.20.2.patch",
    bytes = "approved patch bytes\n";
  await mkdir(path.join(f.root, "patches"));
  await writeFile(path.join(f.root, file), bytes);
  await writeFile(
    path.join(f.root, "package.json"),
    JSON.stringify({
      packageManager: f.qualification.packageManager,
      scripts: {},
    }),
  );
  const q = {
    ...f.qualification,
    mode: "direct",
    argv: ["exec", "changeset", "version"],
    scripts: {},
    files: { [file]: hash(bytes) },
  };
  assert.equal(
    (await guardVersioningInputs(f.root, q, f.contracts, "24.15.0")).version,
    "2.31.1",
  );
});

test("@ path support retains traversal, absolute, backslash and escaped-symlink rejection", async (t) => {
  const f = await fixture(t);
  for (const file of [
    "../../outside@.patch",
    "/tmp/outside@.patch",
    "patches\\outside@.patch",
    "patches/../outside@.patch",
    "patches/./inside@.patch",
    "patches@2/inside.patch",
  ])
    await assert.rejects(
      guardVersioningInputs(
        f.root,
        { ...f.qualification, files: { [file]: hash("x") } },
        f.contracts,
        "24.15.0",
      ),
      /qualification path or binding/,
    );
  await mkdir(path.join(f.root, "patches"));
  const outside = path.join(f.parent, "outside@.patch");
  await writeFile(outside, "x");
  await symlink(outside, path.join(f.root, "patches/inside@.patch"));
  await assert.rejects(
    guardVersioningInputs(
      f.root,
      { ...f.qualification, files: { "patches/inside@.patch": hash("x") } },
      f.contracts,
      "24.15.0",
    ),
    /escapes its source/,
  );
});
