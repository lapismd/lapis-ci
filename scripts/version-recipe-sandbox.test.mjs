import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRecipeSandbox } from "./version-recipe-sandbox.mjs";

test("proof metadata leaves a consumer with no local-directory ignore unchanged", async (t) => {
  const parent = await mkdtemp(
    path.join(tmpdir(), "lapis-sandbox-regression-"),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const source = path.join(parent, "consumer");
  await mkdir(source);
  const sandbox = await createRecipeSandbox(source, parent);
  await writeFile(sandbox.status, "{}");
  await writeFile(path.join(sandbox.bin, "node"), "fixture");
  assert.deepEqual(await readdir(source), []);
  assert(!sandbox.directory.startsWith(source + path.sep));
  await sandbox.cleanup();
  await assert.rejects(access(sandbox.directory), { code: "ENOENT" });
  assert.deepEqual(await readdir(source), []);
});

test("a temporary root inside the consumer cannot hide proof metadata in source", async (t) => {
  const source = await mkdtemp(path.join(tmpdir(), "lapis-sandbox-source-"));
  t.after(() => rm(source, { recursive: true, force: true }));
  const nested = path.join(source, "temp");
  await mkdir(nested);
  for (const root of [source, nested])
    await assert.rejects(
      createRecipeSandbox(source, root),
      /outside consumer source/,
    );
  assert.deepEqual(await readdir(source), ["temp"]);
});
