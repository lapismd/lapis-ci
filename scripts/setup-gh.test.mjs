import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ghAsset, downloadGh } from "./setup-gh.mjs";

const bytes = Buffer.from("pinned test archive");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const versions = {
  gh: "2.102.0",
  ghAssets: {
    "linux/amd64": { target: "linux_amd64", sha256 },
    "linux/arm64": { target: "linux_arm64", sha256 },
  },
};
test("host CLI uses the image's exact version and architecture checksum", () => {
  assert.equal(
    ghAsset(versions, "linux", "x64").name,
    "gh_2.102.0_linux_amd64.tar.gz",
  );
  assert.equal(
    ghAsset(versions, "linux", "arm64").name,
    "gh_2.102.0_linux_arm64.tar.gz",
  );
  assert.throws(() => ghAsset(versions, "darwin", "arm64"));
  assert.throws(() => ghAsset({ ...versions, gh: "latest" }, "linux", "x64"));
});
test("archive bytes must match the reviewed checksum", async () => {
  const asset = ghAsset(versions, "linux", "x64");
  assert.deepEqual(
    await downloadGh(asset, async () => new Response(bytes)),
    bytes,
  );
  await assert.rejects(
    downloadGh(asset, async () => new Response("tampered")),
    /checksum mismatch/,
  );
});
test("official API fallback selects exactly the same asset and preserves its checksum", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options]);
    if (calls.length === 1) return new Response(null, { status: 404 });
    if (calls.length === 2)
      return Response.json({
        assets: [
          {
            name: "gh_2.102.0_linux_amd64.tar.gz",
            url: "https://api.github.com/repos/cli/cli/releases/assets/123",
          },
        ],
      });
    return new Response(bytes);
  };
  assert.deepEqual(
    await downloadGh(ghAsset(versions, "linux", "x64"), fetcher),
    bytes,
  );
  assert.equal(calls.length, 3);
  assert.equal(calls[2][1].headers.Accept, "application/octet-stream");
  assert(!calls.some(([, options]) => options.headers.Authorization));
});
