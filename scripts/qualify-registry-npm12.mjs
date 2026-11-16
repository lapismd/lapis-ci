import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const npm12 = Object.freeze({
  version: "12.0.2",
  url: "https://registry.npmjs.org/npm/-/npm-12.0.2.tgz",
  integrity:
    "sha512-uIXokLlBj6FpNUTQX1PmT5pz7BlIN9QlixX+zdaSNHsd0qUXsbDLr50xzY6Sw7cJVr0uzHKDOle0swmPW/p5Qw==",
});
export function verifyNpm12Archive(bytes) {
  assert(
    Buffer.isBuffer(bytes) && bytes.length <= 8 * 1024 * 1024,
    "Unbounded npm12 archive",
  );
  assert.equal(
    "sha512-" + createHash("sha512").update(bytes).digest("base64"),
    npm12.integrity,
    "Unreviewed npm12 archive bytes",
  );
}

/** Qualify an existing publisher tool without changing the installed/global npm. */
export async function qualifyRegistryNpm12(
  fetcher = fetch,
  execute = execFileSync,
) {
  assert.equal(
    process.versions.node,
    "24.15.0",
    "Qualify on the reviewed Node runtime",
  );
  const originalNpm = execute("npm", ["--version"], {
    encoding: "utf8",
    timeout: 10000,
  }).trim();
  const response = await fetcher(npm12.url, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, "npm12 archive unavailable");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert(size <= 8 * 1024 * 1024, "Unbounded npm12 archive");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  verifyNpm12Archive(bytes);
  const root = await mkdtemp(path.join(tmpdir(), "registry-npm12-proof-"));
  try {
    const archive = path.join(root, "npm.tgz"),
      bin = path.join(root, "bin"),
      config = path.join(root, "npmrc");
    await writeFile(archive, bytes);
    await mkdir(bin);
    await writeFile(config, "");
    const entries = execute("tar", ["-tzf", archive], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    })
      .trim()
      .split("\n");
    assert(
      entries.length <= 3000 &&
        entries.every(
          (p) =>
            p.startsWith("package/") &&
            !p.includes("\\") &&
            !p.split("/").includes(".."),
        ),
      "Unexpected npm archive paths",
    );
    const types = execute("tar", ["-tvzf", archive], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    })
      .trim()
      .split("\n");
    assert(
      types.every((line) => /^[d-]/.test(line)),
      "Linked npm archive paths are forbidden",
    );
    execute("tar", [
      "-xzf",
      archive,
      "-C",
      root,
      "--no-same-owner",
      "--no-same-permissions",
    ]);
    const pkg = JSON.parse(
      await readFile(path.join(root, "package/package.json"), "utf8"),
    );
    assert.equal(pkg.name, "npm");
    assert.equal(pkg.version, npm12.version);
    const cli = await realpath(path.join(root, "package/bin/npm-cli.js"));
    assert(cli.startsWith(root + path.sep));
    await symlink(cli, path.join(bin, "npm"));
    const env = {};
    for (const name of [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "PNPM_HOME",
      "COREPACK_HOME",
      "XDG_CACHE_HOME",
      "LANG",
      "LC_ALL",
      "CI",
      "SSL_CERT_FILE",
      "SSL_CERT_DIR",
    ])
      if (process.env[name] !== undefined) env[name] = process.env[name];
    env.PATH = bin + path.delimiter + process.env.PATH;
    env.npm_config_userconfig = config;
    assert.equal(
      execute("npm", ["--version"], {
        env,
        encoding: "utf8",
        timeout: 10000,
      }).trim(),
      npm12.version,
    );
    execute(
      process.execPath,
      [
        "--test",
        "scripts/registry-adapter-npm12.test.mjs",
        "scripts/registry-readiness.test.mjs",
        "scripts/registry-install-process.test.mjs",
        "scripts/registry-npm-protocol.test.mjs",
        "scripts/setup-registry-readiness.test.mjs",
      ],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env,
        stdio: "inherit",
        timeout: 120000,
      },
    );
    assert.equal(
      execute("npm", ["--version"], {
        encoding: "utf8",
        timeout: 10000,
      }).trim(),
      originalNpm,
      "Global npm changed during qualification",
    );
    return {
      node: process.versions.node,
      npm: npm12.version,
      integrity: npm12.integrity,
      globalNpmChanged: false,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(await qualifyRegistryNpm12()));
