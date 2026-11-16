import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  aiRecipeEnvironment,
  bootstrapAiRecipe,
  validateAiRecipeProfile,
  verifyAiRecipeTools,
} from "./ai-version-recipe.mjs";
import { selectRecipeCase } from "./version-recipe-layout.mjs";

const cases = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const example = cases.cases["ai-changesets2-native"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("only the explicitly reviewed AI case selects the Node22 native profile", () => {
  assert.equal(selectRecipeCase(cases, "ai-changesets2-native"), example);
  assert.equal(example.sourceSha, example.closureEvidence.currentSourceSha);
  for (const [file, hash] of Object.entries(example.qualification.files))
    assert.equal(hash, example.closureEvidence.sourceHashes[file]);
  for (const archive of example.nativeTools.archiveEvidence.archives)
    assert.equal(
      archive.executableSha256,
      example.nativeTools.binaries[archive.name],
    );
  assert.equal(
    validateAiRecipeProfile(cases.cases["plugins-changesets2"]),
    null,
  );
  for (const change of [
    { profile: undefined },
    { profile: "arbitrary-command" },
    { repository: "lapismd/design-core" },
    { ignorePnpmfile: false },
    { qualification: { ...example.qualification, nodeMajor: 24 } },
    { nativeTools: { ...example.nativeTools, minimumFreeGiB: 29 } },
    { nativeTools: { ...example.nativeTools, rustVersion: "1.98.0" } },
    { nativeTools: { ...example.nativeTools, nodeVersion: "22" } },
  ])
    assert.throws(() => validateAiRecipeProfile({ ...example, ...change }));
});

test("AI recipe environment admits native prerequisites without caller credentials or wrappers", () => {
  const env = aiRecipeEnvironment({
    PATH: "/tools",
    HOME: "/runner",
    CARGO_HOME: "/cargo",
    UNRELATED_SECRET: "not-forwarded",
    RUSTC_WRAPPER: "not-forwarded",
  });
  assert.equal(env.LAPIS_AI_VALIDATION_RUNTIME, "native");
  assert.equal(env.CARGO_BUILD_JOBS, "1");
  assert.equal(env.CARGO_HOME, "/cargo");
  assert.equal(env.UNRELATED_SECRET, undefined);
  assert.equal(env.RUSTC_WRAPPER, undefined);
  for (const name of [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "NODE_AUTH_TOKEN",
    "NPM_TOKEN",
    "LAPIS_DEPENDENCY_APP_PRIVATE_KEY",
  ])
    assert.throws(
      () => aiRecipeEnvironment({ [name]: "forbidden-fixture-input" }),
      /credentials/,
    );
});

async function toolsFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "ai-recipe-tools-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const selected = structuredClone(example),
    paths = {};
  for (const name of ["node", "cargo", "rustc"]) {
    paths[name] = path.join(root, name);
    await writeFile(paths[name], `unit tool bytes: ${name}`);
    selected.nativeTools.binaries[name] = hash(`unit tool bytes: ${name}`);
  }
  const calls = [];
  const execute = (command, args) => {
    calls.push([command, args]);
    if (command === "rustup") return paths[args.at(-1)];
    if (command === paths.cargo) return "cargo 1.99.0 (unit fixture)";
    if (command === paths.rustc)
      return "rustc 1.99.0 (unit fixture)\nhost: x86_64-unknown-linux-gnu";
    if (command === "pnpm") return "10.34.5";
    throw Error("Unexpected tool execution");
  };
  return {
    root,
    selected,
    paths,
    calls,
    options: {
      execute,
      platform: "linux",
      arch: "x64",
      nodeVersion: "22.23.5",
      nodePath: paths.node,
      statfs: async () => ({ bavail: 64 * 1024 ** 3, bsize: 1 }),
    },
  };
}

test("native tool receipts require actual bytes, versions, target, pnpm and free disk", async (t) => {
  const f = await toolsFixture(t),
    env = aiRecipeEnvironment({ PATH: "/tools" });
  const result = await verifyAiRecipeTools(f.root, f.selected, env, f.options);
  assert.deepEqual(result.receipt.binaries, f.selected.nativeTools.binaries);
  assert.equal(result.receipt.packageManager, "pnpm@10.34.5");
  assert.equal(result.paths.cargo, f.paths.cargo);
  for (const override of [
    { nodeVersion: "24.15.0" },
    { arch: "arm64" },
    { statfs: async () => ({ bavail: 29 * 1024 ** 3, bsize: 1 }) },
    {
      execute: () => {
        throw Error("Rust toolchain missing");
      },
    },
    {
      execute: (command, args) =>
        command === "pnpm" ? "10.32.1" : f.options.execute(command, args),
    },
    {
      execute: (command, args) =>
        command === f.paths.cargo
          ? "cargo 1.98.0 (wrong)"
          : f.options.execute(command, args),
    },
  ])
    await assert.rejects(
      verifyAiRecipeTools(f.root, f.selected, env, {
        ...f.options,
        ...override,
      }),
    );
  await writeFile(f.paths.cargo, "changed binary");
  await assert.rejects(
    verifyAiRecipeTools(f.root, f.selected, env, f.options),
    /cargo executable bytes/,
  );
});

test("source bootstrap retains check then locked Cargo fetch and propagates failure", () => {
  const calls = [],
    env = aiRecipeEnvironment({ PATH: "/tools" });
  bootstrapAiRecipe("/consumer", env, (command, args, options) => {
    assert.equal(options.cwd, "/consumer");
    assert.equal(options.env.LAPIS_AI_VALIDATION_RUNTIME, "native");
    calls.push([command, args]);
  });
  assert.deepEqual(calls, [
    ["pnpm", ["release:check"]],
    ["pnpm", ["dev:cargo", "--", "fetch", "--locked"]],
  ]);
  assert.throws(
    () =>
      bootstrapAiRecipe("/consumer", env, () => {
        throw Error("offline prerequisite unavailable");
      }),
    /prerequisite unavailable/,
  );
});

test("native workflow preserves credential-free AI and existing read-only Node24 paths", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/qualify-version-recipe.yml", import.meta.url),
    "utf8",
  );
  const native = workflow
    .split(
      "- name: Qualify the genuine AI native recipe without credentials",
    )[1]
    .split("- uses: actions/upload-artifact")[0];
  assert(!/GITHUB_TOKEN|secrets\./.test(native));
  assert.match(native, /RECIPE_CASE: \$\{\{ steps.recipe.outputs.case \}\}/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github.token \}\}/);
  assert.match(workflow, /toolchain: "1\.99\.0"/);
  assert.match(workflow, /permissions:\n  contents: read/);
  const runner = await readFile(
    new URL("./qualify-version-recipe.mjs", import.meta.url),
    "utf8",
  );
  const preflight = runner.indexOf("await verifyAiRecipeTools(");
  assert(
    preflight > 0 && preflight < runner.indexOf('run(["install",'),
    "Official tool preflight must precede source install hooks",
  );
  assert.match(
    runner,
    /run\(\s*\["install",\s*"--frozen-lockfile",\s*"--ignore-pnpmfile"\],\s*setupEnv\s*\)/,
  );
  assert.match(runner, /run\(\["release:version"\],\s*env\)/);
  assert(runner.includes('spawnSync("deno", ["--version"]'));
  assert.equal(
    example.historicalNoteSourceSha,
    "46fceebd76bfcdcc6e5e629205e1779406ead3d3",
  );
  assert.equal(
    example.pending.sha256,
    "fa167ff89119d3f8e6200b751278260bbd866118576c1bdcd3251dc8a6771ff2",
  );
});
