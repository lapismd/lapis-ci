import assert from "node:assert/strict";
import test from "node:test";
import { promoteDependencyImage } from "./dependency-promotion.mjs";

const image = "ghcr.io/lapismd/lapis-plugins-ci",
  digest = `sha256:${"a".repeat(64)}`;
const expected = {
  identity: `sha256:${"b".repeat(64)}`,
  tag: `deps-${"b".repeat(64)}`,
};
function fixture({
  existing = false,
  unavailable = false,
  badStage = false,
  changedAfter = false,
  race = false,
  failedWrite = false,
} = {}) {
  const calls = [];
  let reads = 0,
    written = false;
  return {
    calls,
    expected,
    image,
    repository: "lapismd/lapis-plugins",
    digest,
    sourceRef: "refs/heads/main",
    lookup: async (reference) => {
      calls.push(["lookup", reference]);
      return { state: "found" };
    },
    resolve: async (options) => {
      if (options.lookup) {
        await options.lookup();
        calls.push(["verify-stage"]);
        if (badStage) throw Error("invalid signed inputs");
        return { state: "hit", reference: `${image}@${digest}` };
      }
      reads++;
      calls.push(["resolve-tag"]);
      if (unavailable) return { state: "unavailable" };
      return existing || written || (race && reads > 1)
        ? {
            state: "hit",
            reference: `${image}@${changedAfter ? `sha256:${"c".repeat(64)}` : digest}`,
          }
        : { state: "miss" };
    },
    run: async (command, args) => {
      calls.push(["write", command, args]);
      written = true;
      if (failedWrite) throw Error("connection lost after acceptance");
    },
  };
}
test("publication verifies staging before a single immutable tag promotion and read-back", async () => {
  const f = fixture();
  assert.equal((await promoteDependencyImage(f)).state, "published");
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    [
      "resolve-tag",
      "lookup",
      "verify-stage",
      "resolve-tag",
      "write",
      "resolve-tag",
    ],
  );
  assert.deepEqual(f.calls.find((c) => c[0] === "write").slice(1), [
    "docker",
    [
      "buildx",
      "imagetools",
      "create",
      "--tag",
      `${image}:${expected.tag}`,
      `${image}@${digest}`,
    ],
  ]);
});
for (const state of ["existing", "race"])
  test(`a valid ${state} identity is reused without overwriting it`, async () => {
    const f = fixture({ [state]: true });
    assert.equal((await promoteDependencyImage(f)).state, "reused");
    assert(!f.calls.some((c) => c[0] === "write"));
  });
for (const state of ["unavailable", "badStage"])
  test(`${state} cannot publish an unverified or uncertain tag`, async () => {
    const f = fixture({ [state]: true });
    await assert.rejects(promoteDependencyImage(f));
    assert(!f.calls.some((c) => c[0] === "write"));
  });
for (const state of ["changedAfter", "failedWrite"])
  test(`${state} fails without retrying an uncertain registry write`, async () => {
    const f = fixture({ [state]: true });
    await assert.rejects(promoteDependencyImage(f), /uncertain|differ/i);
    assert.equal(f.calls.filter((c) => c[0] === "write").length, 1);
  });
test("publication is rejected outside trusted main before reads or writes", async () => {
  const f = fixture();
  f.sourceRef = "refs/pull/1/merge";
  await assert.rejects(promoteDependencyImage(f), /main/);
  assert.equal(f.calls.length, 0);
});
