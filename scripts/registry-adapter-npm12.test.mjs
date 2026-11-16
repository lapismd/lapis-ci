import assert from "node:assert/strict";
import test from "node:test";
import { registryInstaller } from "./registry-install-adapters.mjs";

test("Tasks' existing npm12 publisher has a separate strict-peer profile", () => {
  const adapter = registryInstaller("npm12-strict-peers", "12.0.2");
  assert.equal(typeof adapter.run, "function");
  assert.equal(typeof adapter.pending, "function");
  assert.throws(() => registryInstaller("npm-strict-peers", "12.0.2"));
  assert.throws(() => registryInstaller("npm12-strict-peers", "11.12.1"));
});
