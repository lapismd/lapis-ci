import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkRepository } from "./check-repository.mjs";

test("the repository image contract is internally consistent", async () => {
  const versions = await checkRepository();
  assert.deepEqual(versions.platforms, ["linux/amd64", "linux/arm64"]);
});

test("a missing GitHub CLI version is rejected", async () => {
  const root = await fixtureRoot();
  const versionsPath = path.join(root, "versions.json");
  const versions = JSON.parse(await readFixture(versionsPath));
  delete versions.gh;
  await writeFile(versionsPath, JSON.stringify(versions));
  await assert.rejects(checkRepository(root), /gh must be pinned/);
});

test("a missing architecture-specific GitHub CLI checksum is rejected", async () => {
  const root = await fixtureRoot();
  const versionsPath = path.join(root, "versions.json");
  const versions = JSON.parse(await readFixture(versionsPath));
  versions.gh = "2.102.0";
  versions.ghAssets = {};
  await writeFile(versionsPath, JSON.stringify(versions));
  await assert.rejects(checkRepository(root), /GitHub CLI asset for linux\/amd64/);
});

test("a Dockerfile missing the pinned GitHub CLI version is rejected", async () => {
  const root = await fixtureRoot();
  const dockerfilePath = path.join(root, "Dockerfile");
  const dockerfile = await readFixture(dockerfilePath);
  await writeFile(dockerfilePath, dockerfile.replace(/^ARG GH_VERSION=.*\n/m, ""));
  await assert.rejects(checkRepository(root), /missing ARG GH_VERSION/);
});

test("floating latest tags are rejected", async () => {
  const root = await fixtureRoot();
  await writeFile(
    path.join(root, ".github/workflows/ci.yml"),
    "image: ghcr.io/lapismd/lapis-ci:latest\n",
  );
  await assert.rejects(checkRepository(root), /latest image tag/);
});

test("a single-platform publication is rejected", async () => {
  const root = await fixtureRoot();
  const workflowPath = path.join(root, ".github/workflows/publish.yml");
  const workflow = await readFixture(workflowPath);
  await writeFile(
    workflowPath,
    workflow.replace("linux/amd64,linux/arm64", "linux/amd64"),
  );
  await assert.rejects(checkRepository(root), /amd64 and arm64/);
});

test("a runner Node version that drifts from the image is rejected", async () => {
  const root = await fixtureRoot();
  const workflowPath = path.join(root, ".github/workflows/ci.yml");
  const workflow = await readFixture(workflowPath);
  await writeFile(
    workflowPath,
    workflow.replace("node-version: 24.15.0", "node-version: 24.16.0"),
  );
  await assert.rejects(checkRepository(root), /CI workflow is out of sync/);
});

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "lapis-ci-contract-"));
  await mkdir(path.join(root, ".github/workflows"), { recursive: true });
  for (const relative of [
    "versions.json",
    "Dockerfile",
    ".github/workflows/ci.yml",
    ".github/workflows/publish.yml",
  ]) {
    const source = path.resolve(relative);
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFixture(source));
  }
  return root;
}

async function readFixture(file) {
  const { readFile } = await import("node:fs/promises");
  return readFile(file, "utf8");
}
