import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { npm12, verifyNpm12Archive } from "./qualify-registry-npm12.mjs";

test("npm12 qualification binds the existing publisher's exact official archive", () => {
  assert.equal(npm12.version, "12.0.2");
  assert.equal(npm12.url, "https://registry.npmjs.org/npm/-/npm-12.0.2.tgz");
  assert.match(npm12.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.throws(
    () => verifyNpm12Archive(Buffer.from("changed npm bytes")),
    /Unreviewed/,
  );
  assert.throws(
    () => verifyNpm12Archive(Buffer.alloc(8 * 1024 * 1024 + 1)),
    /Unbounded/,
  );
});
test("hosted source qualification runs npm12 proof without replacing global npm or adding authority", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /run: node scripts\/qualify-registry-npm12.mjs/);
  assert(!workflow.includes("npm install --global"));
  const script = await readFile(
    new URL("./qualify-registry-npm12.mjs", import.meta.url),
    "utf8",
  );
  assert(
    script.indexOf("verifyNpm12Archive(bytes);") <
      script.indexOf('execute("tar"'),
  );
  assert.match(script, /finally.*rm\(root/s);
});
