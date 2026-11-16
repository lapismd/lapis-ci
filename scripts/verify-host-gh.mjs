import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ghAsset, verifyGhVersion } from "./setup-gh.mjs";

assert.equal(
  process.platform,
  "darwin",
  "Native Darwin qualification required",
);
assert.equal(process.arch, "arm64", "Native ARM64 qualification required");
const versions = JSON.parse(
    await readFile(new URL("../versions.json", import.meta.url), "utf8"),
  ),
  hosts = JSON.parse(
    await readFile(new URL("../gh-host-assets.json", import.meta.url), "utf8"),
  ),
  asset = ghAsset(versions, process.platform, process.arch, hosts),
  binary = await realpath(
    execFileSync("which", ["gh"], { encoding: "utf8" }).trim(),
  ),
  root = path.dirname(binary),
  temp = await realpath(process.env.RUNNER_TEMP);
assert.equal(
  path.dirname(root),
  temp,
  "Shared setup must own the temporary install",
);
assert.match(path.basename(root), /^lapis-ci-gh-/);
const bytes = await readFile(binary),
  sha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(sha256, asset.binarySha256);
const version = verifyGhVersion(binary, asset.version),
  help = execFileSync(binary, ["attestation", "verify", "--help"], {
    encoding: "utf8",
  });
for (const flag of [
  "--bundle",
  "--cert-oidc-issuer",
  "--cert-identity",
  "--predicate-type",
  "--deny-self-hosted-runners",
  "--digest-alg",
  "--repo",
  "--source-digest",
  "--source-ref",
  "--signer-digest",
  "--custom-trusted-root",
  "--format",
])
  assert.ok(help.includes(flag), `Missing attestation ABI ${flag}`);
const receipt = {
  schemaVersion: 1,
  platform: process.platform,
  arch: process.arch,
  node: process.versions.node,
  sourceSha: process.env.GITHUB_SHA,
  version,
  sha256,
  sharedOwnedInstall: true,
  attestationAbi: true,
  published: false,
};
await mkdir("reports", { recursive: true });
await writeFile(
  "reports/host-gh-darwin-arm64.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
