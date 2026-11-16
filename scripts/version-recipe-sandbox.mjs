import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/** Qualification owns its temporary metadata independently of consumer ignores. */
export async function createRecipeSandbox(root, temporaryRoot = tmpdir()) {
  const source = await realpath(root),
    parent = await realpath(temporaryRoot);
  assert(
    parent !== source && !parent.startsWith(source + path.sep),
    "Recipe metadata must stay outside consumer source",
  );
  const directory = await mkdtemp(path.join(parent, "lapis-version-recipe-"));
  const bin = path.join(directory, "bin");
  await mkdir(bin);
  return {
    directory,
    bin,
    status: path.join(directory, "status.json"),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
