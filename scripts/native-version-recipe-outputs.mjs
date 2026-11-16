import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function canonicalHashes(root, directory = "spec/src") {
  const result = {};
  for (const entry of await readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const file = path.posix.join(directory, entry.name);
    assert(
      !entry.isSymbolicLink(),
      "Canonical fixture input must not be a symlink",
    );
    if (entry.isDirectory())
      Object.assign(result, await canonicalHashes(root, file));
    else {
      assert(entry.isFile(), "Unexpected canonical fixture input");
      result[file] = hash(await readFile(path.join(root, file)));
    }
  }
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  );
}
