import assert from "node:assert/strict";
import test from "node:test";
import { registryInstaller } from "./registry-install-adapters.mjs";
test("Mira npm12 readiness supports its default-peer profile without downgrading the tool", () => {
  const installer = registryInstaller("npm12-default-peers", "12.0.2");
  assert.equal(typeof installer.run, "function");
  assert.equal(typeof installer.pending, "function");
  assert.throws(() => registryInstaller("npm12-default-peers", "11.12.1"));
  assert.throws(() => registryInstaller("npm-default-peers", "12.0.2"));
});
