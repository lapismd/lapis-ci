import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyVersionOutputs } from "./version-recipe-outputs.mjs";

test("actual recipe output assertions bind runtime JSON and canonical text to prepared package versions", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lapis-version-outputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "spec"));
  const outputs = [
    { path: "manifest.json", packageName: "pkg", kind: "json-version" },
    {
      path: "spec/release.md",
      packageName: "pkg",
      kind: "text-marker",
      marker: "Release version: `{{version}}`.",
    },
  ];
  const releases = [{ name: "pkg", oldVersion: "1.0.0", newVersion: "1.0.1" }];
  const write = async (version) => {
    await writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify({ version }),
    );
    await writeFile(
      path.join(root, "spec/release.md"),
      `Release version: \`${version}\`.\n`,
    );
  };
  await write("1.0.0");
  assert.equal(
    (await verifyVersionOutputs(root, outputs, releases, "before")).length,
    2,
  );
  await assert.rejects(
    verifyVersionOutputs(root, outputs, releases, "after"),
    /version/,
  );
  await write("1.0.1");
  assert.equal(
    (await verifyVersionOutputs(root, outputs, releases, "after"))[0].version,
    "1.0.1",
  );
  await writeFile(
    path.join(root, "spec/release.md"),
    "Release version: `1.0.0`.\n",
  );
  await assert.rejects(
    verifyVersionOutputs(root, outputs, releases, "after"),
    /marker/,
  );
  for (const bad of [
    { ...outputs[0], path: "../outside.json" },
    { ...outputs[0], packageName: "other" },
    { ...outputs[1], marker: "missing placeholder" },
  ]) {
    await assert.rejects(verifyVersionOutputs(root, [bad], releases, "after"));
  }
  const external = await mkdtemp(path.join(tmpdir(), "lapis-version-outside-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  await writeFile(path.join(external, "manifest.json"), '{"version":"1.0.1"}');
  await symlink(
    path.join(external, "manifest.json"),
    path.join(root, "escape.json"),
  );
  await assert.rejects(
    verifyVersionOutputs(
      root,
      [{ ...outputs[0], path: "escape.json" }],
      releases,
      "after",
    ),
    /escapes/,
  );
  await assert.rejects(
    verifyVersionOutputs(
      root,
      [{ ...outputs[0], path: "missing.json" }],
      releases,
      "after",
    ),
    { code: "ENOENT" },
  );
});
