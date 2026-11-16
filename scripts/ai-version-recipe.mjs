import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath, statfs } from "node:fs/promises";

export const AI_RECIPE_PROFILE = "ai-node22-rust-offline";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => /^[a-f0-9]{64}$/.test(value ?? "");

export function validateAiRecipeProfile(example) {
  if (example.profile === undefined) {
    assert.notEqual(
      example.repository,
      "lapismd/lapis-ai",
      "AI needs its native profile",
    );
    assert.equal(example.qualification?.nodeMajor ?? 24, 24);
    return null;
  }
  const tools = example.nativeTools;
  assert(
    example.profile === AI_RECIPE_PROFILE &&
      example.repository === "lapismd/lapis-ai" &&
      example.qualification.nodeMajor === 22 &&
      example.qualification.cliVersion === "2.31.1" &&
      example.qualification.packageManager === "pnpm@10.34.5" &&
      example.qualification.scripts["release:version"] ===
        "node scripts/changeset-version.mjs" &&
      example.ignorePnpmfile === true &&
      tools?.rustVersion === "1.99.0" &&
      /^22\.\d+\.\d+$/.test(tools.nodeVersion ?? "") &&
      tools.host === "x86_64-unknown-linux-gnu" &&
      tools.minimumFreeGiB === 30 &&
      tools.cargoPackages === 15 &&
      ["node", "cargo", "rustc"].every((name) =>
        digest(tools.binaries?.[name]),
      ),
    "AI qualification needs the reviewed Node22/Rust offline profile",
  );
  return tools;
}

/** No credential is needed by AI's public dependency/bootstrap/changelog path. */
export function aiRecipeEnvironment(base) {
  for (const key of [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "NODE_AUTH_TOKEN",
    "NPM_TOKEN",
    "LAPIS_DEPENDENCY_APP_PRIVATE_KEY",
  ])
    assert(!base[key], "AI fixture must not receive credentials");
  const env = {};
  for (const name of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "PNPM_HOME",
    "CARGO_HOME",
    "CARGO_TARGET_DIR",
    "RUSTUP_HOME",
    "LANG",
    "LC_ALL",
    "CI",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ])
    if (base[name] !== undefined) env[name] = base[name];
  return {
    ...env,
    LAPIS_AI_VALIDATION_RUNTIME: "native",
    CARGO_BUILD_JOBS: "1",
    CARGO_INCREMENTAL: "0",
  };
}

/** Verify installed official executable bytes before any native bootstrap. */
export async function verifyAiRecipeTools(root, example, env, options = {}) {
  const tools = validateAiRecipeProfile(example);
  assert(tools, "An explicit AI profile is required");
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
  const paths = { node: options.nodePath ?? process.execPath };
  for (const name of ["cargo", "rustc"])
    paths[name] = run("rustup", [
      "which",
      "--toolchain",
      tools.rustVersion,
      name,
    ]);
  const binaries = {};
  for (const [name, file] of Object.entries(paths)) {
    paths[name] = await realpath(file);
    const actual = hash(await readFile(paths[name]));
    assert.equal(
      actual,
      tools.binaries[name],
      `Unreviewed ${name} executable bytes`,
    );
    binaries[name] = actual;
  }
  const cargo = run(paths.cargo, ["--version"]);
  const rustc = run(paths.rustc, ["-vV"]);
  assert(cargo.startsWith(`cargo ${tools.rustVersion} `));
  assert(rustc.startsWith(`rustc ${tools.rustVersion} `));
  assert(rustc.split("\n").includes(`host: ${tools.host}`));
  const packageManager = `pnpm@${run("pnpm", ["--version"])}`;
  assert.equal(packageManager, example.qualification.packageManager);
  const disk = await (options.statfs ?? statfs)(root);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  assert(
    freeBytes >= tools.minimumFreeGiB * 1024 ** 3,
    "AI recipe requires 30GiB free",
  );
  return {
    paths,
    receipt: {
      node: tools.nodeVersion,
      packageManager,
      cargo,
      rustc,
      binaries,
      freeBytes,
    },
  };
}

/** The unchanged source workflow bootstrap; the real recipe remains offline. */
export function bootstrapAiRecipe(root, env, execute = execFileSync) {
  assert.equal(env.LAPIS_AI_VALIDATION_RUNTIME, "native");
  const commands = [
    ["release:check"],
    ["dev:cargo", "--", "fetch", "--locked"],
  ];
  for (const args of commands)
    execute("pnpm", args, { cwd: root, env, stdio: "inherit" });
  return commands;
}
