import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  chmod,
  symlink,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { dependencyIdentity } from "./dependency-identity.mjs";

const baseImage = `ghcr.io/lapismd/lapis-ci@sha256:${"a".repeat(64)}`;
async function context(t) {
  const root = await mkdtemp(path.join(tmpdir(), "lapis-identity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, "Dockerfile"),
    `ARG LAPIS_CI_IMAGE=${baseImage}\nFROM \${LAPIS_CI_IMAGE}\n`,
  );
  await writeFile(path.join(root, "package.json"), '{"private":true}');
  await writeFile(path.join(root, "pnpm-lock.yaml"), 'lockfileVersion: "9.0"');
  await writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    'packages: ["packages/*"]',
  );
  return root;
}

test("dependency identity binds every build-context byte, path, base and both platforms", async (t) => {
  const root = await context(t);
  const original = await dependencyIdentity({ root, baseImage });
  assert.deepEqual(original.platforms, ["linux/amd64", "linux/arm64"]);
  assert.match(original.identity, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    (await dependencyIdentity({ root, baseImage })).identity,
    original.identity,
  );
  await chmod(path.join(root, "package.json"), 0o755);
  assert.notEqual(
    (await dependencyIdentity({ root, baseImage })).identity,
    original.identity,
  );
  await chmod(
    path.join(root, "package.json"),
    original.files["package.json"].mode,
  );
  for (const file of [
    "Dockerfile",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]) {
    const input = await readFile(path.join(root, file));
    await writeFile(
      path.join(root, file),
      Buffer.concat([input, Buffer.from("\n")]),
    );
    assert.notEqual(
      (await dependencyIdentity({ root, baseImage })).identity,
      original.identity,
      file,
    );
    await writeFile(path.join(root, file), input);
  }
  await mkdir(path.join(root, "packages/demo"), { recursive: true });
  await writeFile(
    path.join(root, "packages/demo/package.json"),
    '{"name":"demo"}',
  );
  const manifest = await dependencyIdentity({ root, baseImage });
  assert.notEqual(manifest.identity, original.identity);
  await mkdir(path.join(root, "patches"));
  await writeFile(path.join(root, "patches/demo.patch"), "patch bytes");
  assert.notEqual(
    (await dependencyIdentity({ root, baseImage })).identity,
    manifest.identity,
  );
  await writeFile(path.join(root, "patches/README.md"), "Public patch notes");
  assert(
    Object.hasOwn(
      (await dependencyIdentity({ root, baseImage })).files,
      "patches/README.md",
    ),
  );
  const otherBase = baseImage.slice(0, -1) + "b";
  await writeFile(path.join(root, "Dockerfile"), `FROM ${otherBase}\n`);
  assert.notEqual(
    (await dependencyIdentity({ root, baseImage: otherBase })).identity,
    original.identity,
  );
});

test("secret, source, installed-package and symlink inputs are rejected", async (t) => {
  for (const file of [
    ".npmrc",
    ".env",
    "index.mjs",
    "node_modules/demo/package.json",
    "token.pem",
  ]) {
    const root = await context(t);
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), "not public dependency data");
    await assert.rejects(
      dependencyIdentity({ root, baseImage }),
      /Unexpected dependency-context (?:file|directory)/,
    );
  }
  const root = await context(t);
  await symlink("package.json", path.join(root, "alias"));
  await assert.rejects(
    dependencyIdentity({ root, baseImage }),
    /symbolic link/,
  );
});

test("CLI writes its receipt outside the context and exposes bounded GitHub outputs", async (t) => {
  const root = await context(t),
    receipt = `${root}-receipt.json`,
    output = `${root}-output.txt`;
  t.after(() =>
    Promise.all([rm(receipt, { force: true }), rm(output, { force: true })]),
  );
  const script = fileURLToPath(
    new URL("./dependency-identity.mjs", import.meta.url),
  );
  const args = [
    script,
    "--context",
    root,
    "--base-image",
    baseImage,
    "--receipt",
    receipt,
    "--github-output",
    output,
  ];
  execFileSync(process.execPath, args, {
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "lapismd/demo",
      GITHUB_SHA: "b".repeat(40),
      GITHUB_WORKFLOW_REF:
        "lapismd/demo/.github/workflows/dependency-image.yml@refs/heads/main",
    },
  });
  const data = JSON.parse(await readFile(receipt, "utf8"));
  assert.equal(data.repository, "lapismd/demo");
  assert.equal(data.sourceSha, "b".repeat(40));
  assert.match(
    await readFile(output, "utf8"),
    /^identity=sha256:[a-f0-9]{64}\ntag=deps-[a-f0-9]{64}\nreceipt=/,
  );
  assert(!Object.hasOwn(data.files, path.basename(receipt)));
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [
        script,
        "--context",
        root,
        "--base-image",
        baseImage,
        "--receipt",
        path.join(root, "receipt.json"),
      ],
      { stdio: "pipe" },
    ),
  );
});

test("incomplete contexts and mutable toolchain references fail closed", async (t) => {
  const root = await context(t);
  await assert.rejects(
    dependencyIdentity({ root, baseImage: "ghcr.io/lapismd/lapis-ci:latest" }),
    /immutable/,
  );
  await rm(path.join(root, "pnpm-lock.yaml"));
  await assert.rejects(
    dependencyIdentity({ root, baseImage }),
    /Missing required/,
  );
});

test("host builder cohort changes invalidate the identity even when source bytes match", async (t) => {
  const root = await context(t);
  const hostTools = JSON.parse(
    await readFile(new URL("../host-tools.json", import.meta.url), "utf8"),
  );
  const original = await dependencyIdentity({ root, baseImage, hostTools });
  const version = hostTools.buildx.split(".").map(Number);
  version[2]++;
  assert.notEqual(
    (
      await dependencyIdentity({
        root,
        baseImage,
        hostTools: { ...hostTools, buildx: version.join(".") },
      })
    ).identity,
    original.identity,
  );
  assert.notEqual(
    (
      await dependencyIdentity({
        root,
        baseImage,
        hostTools: {
          ...hostTools,
          buildkit:
            hostTools.buildkit.slice(0, -1) +
            (hostTools.buildkit.endsWith("0") ? "1" : "0"),
        },
      })
    ).identity,
    original.identity,
  );
});
