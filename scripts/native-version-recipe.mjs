import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath, statfs } from "node:fs/promises";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Native qualification uses only public dependency/bootstrap/changelog paths. */
export function nativeRecipeEnvironment(base) {
  for (const key of [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "NODE_AUTH_TOKEN",
    "NPM_TOKEN",
    "LAPIS_DEPENDENCY_APP_PRIVATE_KEY",
  ])
    assert(!base[key], "Native fixture must not receive credentials");
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
    CARGO_INCREMENTAL: "0",
  };
}

/** Verify installed official executable bytes before any native bootstrap. */
export async function verifyNativeRecipeTools(
  root,
  tools,
  packageManager,
  env,
  options = {},
) {
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
  const actualPackageManager = `pnpm@${run("pnpm", ["--version"])}`;
  assert.equal(actualPackageManager, packageManager);
  const disk = await (options.statfs ?? statfs)(root);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  assert(
    freeBytes >= tools.minimumFreeGiB * 1024 ** 3,
    `Native recipe requires ${tools.minimumFreeGiB}GiB free`,
  );
  return {
    paths,
    receipt: {
      node: tools.nodeVersion,
      packageManager: actualPackageManager,
      cargo,
      rustc,
      binaries,
      freeBytes,
    },
  };
}
