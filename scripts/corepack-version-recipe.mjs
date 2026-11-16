import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const COREPACK_RECIPE_PROFILE = "visual-delta-node24-corepack";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
const codeFiles = [
  "package.json",
  "dist/corepack.js",
  "dist/lib/corepack.cjs",
  "dist/npm.js",
  "dist/npx.js",
  "dist/pnpm.js",
  "dist/pnpx.js",
  "dist/yarn.js",
  "dist/yarnpkg.js",
].sort();
const closureFiles = [
  "package.json",
  "pnpm-lock.yaml",
  ".changeset/config.json",
  "pnpm-workspace.yaml",
  ".github/workflows/release.yml",
  ".changeset/node-version-tooling.md",
].sort();

export function corepackRecipeEnvironment(base) {
  const env = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "PNPM_HOME",
    "COREPACK_HOME",
    "LANG",
    "LC_ALL",
    "CI",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "GITHUB_TOKEN",
  ])
    if (base[key] !== undefined) env[key] = base[key];
  return env;
}

export function validateCorepackRecipeProfile(example) {
  if (example.profile !== COREPACK_RECIPE_PROFILE) {
    assert.notEqual(
      example.repository,
      "lapismd/storybook-addon-visual-delta",
      "Visual Delta requires its reviewed Corepack profile",
    );
    return null;
  }
  const q = example.qualification,
    tools = example.runtimeTools,
    closure = example.closureEvidence;
  assert(
    example.repository === "lapismd/storybook-addon-visual-delta" &&
      example.outputContract === undefined &&
      q.nodeMajor === 24 &&
      q.cliVersion === "3.0.3" &&
      q.packageManager === "pnpm@10.32.1" &&
      q.formatterPolicy === "unconfigured" &&
      q.mode === undefined &&
      q.argv === undefined &&
      isDeepStrictEqual(q.scripts, {
        "release:version":
          "changeset version && corepack pnpm@10.32.1 install --lockfile-only",
      }) &&
      !example.ignorePnpmfile &&
      !example.strictPeerDependencies &&
      !example.afterVersionChecks?.length &&
      !example.versionOutputs?.length &&
      tools?.nodeVersion === "24.15.0" &&
      tools.corepackVersion === "0.34.6" &&
      digest(tools.nodeSha256) &&
      tools.source ===
        "https://nodejs.org/dist/v24.15.0/node-v24.15.0-linux-x64.tar.xz" &&
      digest(tools.archiveSha256) &&
      isDeepStrictEqual(
        Object.keys(tools.corepackFiles ?? {}).sort(),
        codeFiles,
      ) &&
      Object.values(tools.corepackFiles).every(digest),
    "Visual Delta requires its unchanged reviewed Node24/Corepack command and tools",
  );
  assert(
    closure?.comparison === "exact-current-tuple" &&
      closure.currentSourceSha === example.sourceSha &&
      isDeepStrictEqual(closure.sourceHashes, closure.currentHashes) &&
      isDeepStrictEqual(
        Object.keys(closure.sourceHashes ?? {}).sort(),
        closureFiles,
      ) &&
      Object.values(closure.sourceHashes).every(digest) &&
      isDeepStrictEqual(q.files, {
        "pnpm-workspace.yaml": closure.sourceHashes["pnpm-workspace.yaml"],
      }) &&
      q.configSha256 === closure.sourceHashes[".changeset/config.json"] &&
      isDeepStrictEqual(example.emptyChangesets, {
        ".changeset/node-version-tooling.md":
          closure.sourceHashes[".changeset/node-version-tooling.md"],
      }) &&
      isDeepStrictEqual(example.expectedReleases, [
        {
          name: "@lapismd/storybook-addon-visual-delta",
          oldVersion: "0.1.5",
          newVersion: "0.1.6",
        },
      ]),
    "Visual Delta source closure or root release plan changed",
  );
  return tools;
}

async function executableInventory(root, directory = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    assert(
      !entry.isSymbolicLink(),
      "Corepack code inventory must not contain symlinks",
    );
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules")
      files.push(...(await executableInventory(root, file)));
    else if (
      entry.isFile() &&
      (file === "package.json" || /\.(?:cjs|mjs|js)$/.test(file))
    )
      files.push(file);
  }
  return files.sort();
}

/** Check the official Node distribution's actual Corepack before version mutation. */
export async function verifyCorepackRecipeTools(
  root,
  example,
  env,
  options = {},
) {
  const tools = validateCorepackRecipeProfile(example);
  assert(tools, "An explicit Corepack profile is required");
  assert.equal(options.platform ?? process.platform, "linux");
  assert.equal(options.arch ?? process.arch, "x64");
  assert.equal(options.nodeVersion ?? process.versions.node, tools.nodeVersion);
  const execute = options.execute ?? execFileSync;
  const run = (command, args) =>
    execute(command, args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const node = await realpath(options.nodePath ?? process.execPath);
  assert.equal(
    hash(await readFile(node)),
    tools.nodeSha256,
    "Unreviewed Node executable bytes",
  );
  const corepack = await realpath(run("which", ["corepack"]));
  assert.equal(path.basename(corepack), "corepack.js");
  assert.equal(path.basename(path.dirname(corepack)), "dist");
  const folder = path.dirname(path.dirname(corepack));
  assert.deepEqual(
    await executableInventory(folder),
    codeFiles,
    "Corepack code inventory changed",
  );
  for (const [file, expected] of Object.entries(tools.corepackFiles))
    assert.equal(
      hash(await readFile(path.join(folder, file))),
      expected,
      "Unreviewed Corepack executable bytes",
    );
  assert.equal(run(corepack, ["--version"]), tools.corepackVersion);
  assert.equal(
    `pnpm@${run("pnpm", ["--version"])}`,
    example.qualification.packageManager,
  );
  return {
    paths: { node, corepack },
    receipt: {
      node: tools.nodeVersion,
      nodeSha256: tools.nodeSha256,
      corepack: tools.corepackVersion,
      corepackFiles: tools.corepackFiles,
      packageManager: example.qualification.packageManager,
    },
  };
}
