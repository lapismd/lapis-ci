import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hostImageTools } from "./host-image-tools.mjs";

test("producer and resolver host tools share exact client and daemon identities", async () => {
  const value = JSON.parse(
    await readFile(new URL("../host-tools.json", import.meta.url), "utf8"),
  );
  assert.match(hostImageTools(value).buildx, /^v\d+\.\d+\.\d+$/);
  assert.throws(() => hostImageTools({ ...value, buildx: "latest" }));
  assert.throws(() =>
    hostImageTools({ ...value, buildkit: "moby/buildkit:latest" }),
  );
  for (const name of ["setup-image-tools", "publish-dependency-image"]) {
    const action = await readFile(
      new URL(`../actions/${name}/action.yml`, import.meta.url),
      "utf8",
    );
    assert.match(action, /scripts\/host-image-tools\.mjs/);
    assert.match(action, /version: \$\{\{ steps\.tools\.outputs\.version \}\}/);
    assert.match(action, /image=\$\{\{ steps\.tools\.outputs\.buildkit \}\}/);
  }
});
