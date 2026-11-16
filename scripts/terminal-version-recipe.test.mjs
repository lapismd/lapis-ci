import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  validateTerminalRecipeProfile,
  terminalRecipeEnvironment,
  verifyTerminalRecipeTools,
  bootstrapTerminalRecipe,
} from "./terminal-version-recipe.mjs";
import { selectRecipeCase } from "./version-recipe-layout.mjs";

const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const example = data.cases["terminal-changesets2-native"];
test("Terminal profile rejects runtime, command, tool and source-family substitutions", () => {
  assert.equal(validateTerminalRecipeProfile(example).cargoPackages, 4);
  for (const mutate of [
    (q) => {
      delete q.profile;
    },
    (q) => {
      q.profile = "arbitrary-native";
    },
    (q) => {
      q.repository = "lapismd/lapis-ai";
    },
    (q) => {
      q.qualification.nodeMajor = 22;
    },
    (q) => {
      q.qualification.packageManager = "pnpm@10.34.5";
    },
    (q) => {
      q.qualification.scripts["release:version"] = "echo skip";
    },
    (q) => {
      q.ignorePnpmfile = false;
    },
    (q) => {
      q.nativeTools.rustVersion = "1.98.0";
    },
    (q) => {
      q.nativeTools.minimumFreeGiB = 1;
    },
    (q) => {
      q.nativeTools.cargoPackages = 3;
    },
    (q) => {
      q.nativeTools.cpuCount = 1;
    },
    (q) => {
      q.nativeTools.binaries.node = "invalid";
    },
  ]) {
    const q = structuredClone(example);
    mutate(q);
    assert.throws(() =>
      selectRecipeCase(
        { schemaVersion: 1, cases: { terminal: q } },
        "terminal",
      ),
    );
  }
});

test("Terminal environment and bootstrap preserve credential-free locked source setup", () => {
  const env = terminalRecipeEnvironment({
    PATH: "/tools",
    CARGO_HOME: "/cargo",
    TURBO_TOKEN: "discard",
    NODE_OPTIONS: "discard",
  });
  assert.equal(env.CARGO_BUILD_JOBS, "4");
  assert.equal(env.CARGO_INCREMENTAL, "0");
  assert.equal(env.TURBO_TOKEN, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  for (const name of [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "NPM_TOKEN",
    "NODE_AUTH_TOKEN",
    "LAPIS_DEPENDENCY_APP_PRIVATE_KEY",
  ])
    assert.throws(
      () => terminalRecipeEnvironment({ [name]: "must reject" }),
      /must not receive credentials/,
    );
  const calls = [];
  bootstrapTerminalRecipe("/consumer", env, (command, args, options) => {
    assert.equal(options.cwd, "/consumer");
    assert.equal(options.env, env);
    calls.push([command, args]);
  });
  assert.deepEqual(calls, [
    ["pnpm", ["release:check"]],
    ["pnpm", ["dev:cargo", "--", "fetch", "--locked"]],
  ]);
  assert.throws(
    () =>
      bootstrapTerminalRecipe("/consumer", env, () => {
        throw Error("bootstrap failure");
      }),
    /bootstrap failure/,
  );
});

test("Terminal tools require exact installed bytes, Node24, pnpm10.32.1 and 20GiB", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "terminal-native-tools-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const q = structuredClone(example),
    paths = {};
  for (const name of ["node", "cargo", "rustc"]) {
    paths[name] = path.join(root, name);
    await writeFile(paths[name], name);
    q.nativeTools.binaries[name] = createHash("sha256")
      .update(name)
      .digest("hex");
  }
  const execute = (command, args) => {
    if (command === "rustup") return paths[args.at(-1)];
    if (command === paths.cargo) return "cargo 1.99.0 (test)";
    if (command === paths.rustc)
      return "rustc 1.99.0 (test)\nhost: x86_64-unknown-linux-gnu";
    if (command === "pnpm") return "10.32.1";
    throw Error("Unexpected native command");
  };
  const options = {
    execute,
    platform: "linux",
    arch: "x64",
    nodeVersion: "24.15.0",
    nodePath: paths.node,
    statfs: async () => ({ bavail: 20 * 1024 ** 3, bsize: 1 }),
  };
  const env = terminalRecipeEnvironment({ PATH: "/tools" });
  const result = await verifyTerminalRecipeTools(root, q, env, options);
  assert.deepEqual(result.receipt.binaries, q.nativeTools.binaries);
  for (const changed of [
    { nodeVersion: "24.19.0" },
    { arch: "arm64" },
    { statfs: async () => ({ bavail: 19 * 1024 ** 3, bsize: 1 }) },
  ])
    await assert.rejects(
      verifyTerminalRecipeTools(root, q, env, { ...options, ...changed }),
    );
  await writeFile(paths.cargo, "tampered");
  await assert.rejects(
    verifyTerminalRecipeTools(root, q, env, options),
    /cargo executable bytes/,
  );
});

test("hosted Terminal proof stays source-pinned, credential-free and separate from AI Node22", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/qualify-version-recipe.yml", import.meta.url),
    "utf8",
  );
  const terminal = workflow
    .split(
      "- name: Qualify the genuine Terminal native recipe without credentials",
    )[1]
    .split("- uses: actions/upload-artifact")[0];
  assert.match(terminal, /profile == 'terminal-node24-rust-offline'/);
  assert.doesNotMatch(terminal, /GITHUB_TOKEN|GH_TOKEN|secrets\./);
  assert.match(workflow, /inputs.case == 'terminal-changesets2-native'/);
  assert.match(workflow, /permissions:\n  contents: read/);
  const runner = await readFile(
    new URL("./qualify-version-recipe.mjs", import.meta.url),
    "utf8",
  );
  assert.match(runner, /snapshotTerminalRecipeOutputs/);
  assert.match(runner, /verifyTerminalRecipeOutputs/);
  assert.match(runner, /bootstrapTerminalRecipe/);
});
