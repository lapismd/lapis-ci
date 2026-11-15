import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared publication advertises only staging bytes until signed promotion", async () => {
  const action = await readFile(
    new URL("../actions/publish-dependency-image/action.yml", import.meta.url),
    "utf8",
  );
  const guard = action.indexOf('test "$GITHUB_REF" = refs/heads/main');
  const build = action.indexOf("id: build"),
    attest = action.indexOf("Attest the exact staging index"),
    promote = action.indexOf("id: promote");
  assert(guard >= 0 && guard < build && build < attest && attest < promote);
  assert.match(
    action,
    /tags: \$\{\{ inputs\.image \}\}:staging-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(
    action,
    /subject-digest: \$\{\{ steps\.build\.outputs\.digest \}\}/,
  );
  assert.match(
    action,
    /predicate-path: \$\{\{ steps\.identity\.outputs\.receipt \}\}/,
  );
  assert.match(action, /create-storage-record: false/);
  assert.match(action, /platforms: linux\/amd64,linux\/arm64/);
  assert.match(action, /provenance: mode=max/);
  assert.match(action, /sbom: true/);
  assert.equal(
    (action.match(/if: steps\.cache\.outputs\.state != 'hit'/g) ?? []).length,
    3,
  );
  assert.match(action, /case "\$CACHE_STATE" in/);
  assert.doesNotMatch(
    action,
    /gh pr|git push|PRIVATE_KEY|NPM_TOKEN|continue-on-error/,
  );
  for (const name of [
    "publish-dependency-image",
    "setup-image-tools",
    "setup-gh",
  ]) {
    const source = await readFile(
      new URL(`../actions/${name}/action.yml`, import.meta.url),
      "utf8",
    );
    for (const [, use] of source.matchAll(/uses: ([^\s]+)/g))
      assert.match(use, /@[a-f0-9]{40}$/, name);
  }
});
