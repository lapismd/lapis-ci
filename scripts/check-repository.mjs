#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function checkRepository(root = repositoryRoot) {
  const versions = JSON.parse(
    await readFile(path.join(root, "versions.json"), "utf8"),
  );
  const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
  const publishWorkflow = await readFile(
    path.join(root, ".github/workflows/publish.yml"),
    "utf8",
  );
  const ciWorkflow = await readFile(
    path.join(root, ".github/workflows/ci.yml"),
    "utf8",
  );

  assertVersion(versions, "node");
  assertVersion(versions, "pnpm");
  assertVersion(versions, "playwright");
  assertVersion(versions, "mdbook");
  if (!versions.baseImage?.includes(`node:${versions.node}-bookworm@sha256:`)) {
    throw new Error("versions.json must pin the Node base image by digest.");
  }
  if (
    JSON.stringify(versions.platforms) !==
    JSON.stringify(["linux/amd64", "linux/arm64"])
  ) {
    throw new Error("versions.json must declare amd64 and arm64 in order.");
  }
  for (const platform of versions.platforms) {
    const asset = versions.mdbookAssets?.[platform];
    if (!asset?.target || !/^[a-f0-9]{64}$/.test(asset.sha256 ?? "")) {
      throw new Error(`versions.json must pin the mdBook asset for ${platform}.`);
    }
  }

  for (const expected of [
    `ARG NODE_IMAGE=${versions.baseImage}`,
    `ARG PNPM_VERSION=${versions.pnpm}`,
    `ARG PLAYWRIGHT_VERSION=${versions.playwright}`,
    `ARG MDBOOK_VERSION=${versions.mdbook}`,
    `ARG MDBOOK_AMD64_SHA256=${versions.mdbookAssets["linux/amd64"].sha256}`,
    `ARG MDBOOK_ARM64_SHA256=${versions.mdbookAssets["linux/arm64"].sha256}`,
  ]) {
    if (!dockerfile.includes(expected)) {
      throw new Error(`Dockerfile is out of sync: missing ${expected}`);
    }
  }

  if (!publishWorkflow.includes("linux/amd64,linux/arm64")) {
    throw new Error("Publish workflow must build amd64 and arm64 together.");
  }
  if (!publishWorkflow.includes("provenance: mode=max")) {
    throw new Error("Publish workflow must emit maximum BuildKit provenance.");
  }
  if (!publishWorkflow.includes("sbom: true")) {
    throw new Error("Publish workflow must emit an SBOM.");
  }
  if (/lapis-ci:latest/.test(publishWorkflow + ciWorkflow)) {
    throw new Error("Workflows must not publish or consume a latest image tag.");
  }
  if (!/workflow_dispatch:/.test(publishWorkflow)) {
    throw new Error("Image publication must remain manually dispatched.");
  }

  return versions;
}

function assertVersion(versions, key) {
  if (!/^\d+\.\d+\.\d+$/.test(versions[key] ?? "")) {
    throw new Error(`${key} must be pinned to an exact semantic version.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const versions = await checkRepository();
  console.log(
    `Lapis CI repository contract is valid for Node ${versions.node}, pnpm ${versions.pnpm}, Playwright ${versions.playwright}, and mdBook ${versions.mdbook}.`,
  );
}
