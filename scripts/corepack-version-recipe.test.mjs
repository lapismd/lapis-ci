import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { selectRecipeCase } from "./version-recipe-layout.mjs";
import {
  corepackRecipeEnvironment,
  verifyCorepackRecipeTools,
} from "./corepack-version-recipe.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function data() {
  return JSON.parse(
    await readFile(
      new URL("../version-recipe-cases.json", import.meta.url),
      "utf8",
    ),
  );
}

test("Visual Delta requires its actual declared Node24/Corepack version command", async () => {
  const data = JSON.parse(
    await readFile(
      new URL("../version-recipe-cases.json", import.meta.url),
      "utf8",
    ),
  );
  const selected = selectRecipeCase(data, "visual-delta-changesets3-corepack");
  assert.equal(selected.repository, "lapismd/storybook-addon-visual-delta");
  assert.equal(selected.profile, "visual-delta-node24-corepack");
  assert.equal(selected.qualification.packageManager, "pnpm@10.32.1");
  assert.equal(
    selected.qualification.scripts["release:version"],
    "changeset version && corepack pnpm@10.32.1 install --lockfile-only",
  );
  assert.equal(selected.runtimeTools.corepackVersion, "0.34.6");
});

test("Corepack cannot silently substitute commands, source closure or tools", async () => {
  for (const mutate of [
    (c) => delete c.profile,
    (c) => {
      c.qualification.scripts["release:version"] =
        "changeset version && pnpm install --lockfile-only";
    },
    (c) => {
      c.runtimeTools.corepackVersion = "0.34.7";
    },
    (c) => {
      c.qualification.formatterPolicy = "configured";
    },
    (c) => {
      c.closureEvidence.currentHashes["pnpm-lock.yaml"] = "0".repeat(64);
    },
    (c) => {
      c.expectedReleases[0].newVersion = "0.2.0";
    },
    (c) => {
      c.ignorePnpmfile = true;
    },
    (c) => {
      c.runtimeTools.corepackFiles["dist/new.js"] = "0".repeat(64);
    },
  ]) {
    const d = await data();
    mutate(d.cases["visual-delta-changesets3-corepack"]);
    assert.throws(() =>
      selectRecipeCase(d, "visual-delta-changesets3-corepack"),
    );
  }
});

test("Corepack proof retains changelog reads without inheriting writer or Node injection inputs", () => {
  assert.deepEqual(
    corepackRecipeEnvironment({
      PATH: "/bin",
      GITHUB_TOKEN: "read-only-fixture",
      GH_TOKEN: "writer-fixture",
      NODE_OPTIONS: "--require=other",
      COREPACK_INTEGRITY_KEYS: "0",
      NPM_TOKEN: "publish-fixture",
    }),
    { PATH: "/bin", GITHUB_TOKEN: "read-only-fixture" },
  );
});

test("installed Corepack code drift and unknown runtime fail before mutation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lapis-corepack-recipe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const example = (await data()).cases["visual-delta-changesets3-corepack"];
  const folder = path.join(root, "corepack");
  for (const file of Object.keys(example.runtimeTools.corepackFiles)) {
    await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
    await writeFile(path.join(folder, file), file);
    example.runtimeTools.corepackFiles[file] = hash(file);
  }
  const node = path.join(root, "node");
  await writeFile(node, "node-fixture");
  example.runtimeTools.nodeSha256 = hash("node-fixture");
  const options = {
    nodeVersion: "24.15.0",
    nodePath: node,
    platform: "linux",
    arch: "x64",
    execute: (command, args) => {
      if (command === "which") return path.join(folder, "dist/corepack.js");
      if (command === "pnpm") return "10.32.1";
      assert.deepEqual(args, ["--version"]);
      return "0.34.6";
    },
  };
  assert.equal(
    (await verifyCorepackRecipeTools(root, example, {}, options)).receipt
      .corepack,
    "0.34.6",
  );
  await assert.rejects(
    verifyCorepackRecipeTools(
      root,
      example,
      {},
      { ...options, nodeVersion: "24.19.0" },
    ),
  );
  await writeFile(path.join(folder, "dist/lib/corepack.cjs"), "changed");
  await assert.rejects(
    verifyCorepackRecipeTools(root, example, {}, options),
    /Corepack executable bytes/,
  );
  await writeFile(
    path.join(folder, "dist/lib/corepack.cjs"),
    "dist/lib/corepack.cjs",
  );
  await writeFile(path.join(folder, "dist/extra.js"), "extra");
  await assert.rejects(
    verifyCorepackRecipeTools(root, example, {}, options),
    /inventory changed/,
  );
});
