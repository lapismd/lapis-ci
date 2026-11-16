import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { prepareRegistryReadiness } from "./setup-registry-readiness.mjs";

test("source-pinned setup exposes one importable helper without running installation", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "registry-setup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "env"),
    modulePath = await prepareRegistryReadiness(file);
  assert.equal(
    await readFile(file, "utf8"),
    `LAPIS_REGISTRY_READINESS_MODULE=${modulePath}\n`,
  );
  const api = await import(pathToFileURL(modulePath).href);
  assert.equal(typeof api.installPublishedConsumer, "function");
  assert.equal(typeof api.registryInstaller, "function");
  await assert.rejects(
    prepareRegistryReadiness(undefined),
    /hosted environment/,
  );
  const action = await readFile(
    new URL("../actions/setup-registry-readiness/action.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    action,
    /node "\$GITHUB_ACTION_PATH\/\.\.\/\.\.\/scripts\/setup-registry-readiness.mjs"/,
  );
  assert(!/token|secret|curl|install:|npm install/.test(action));
});
