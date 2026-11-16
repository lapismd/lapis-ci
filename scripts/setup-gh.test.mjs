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

const hostAssets = {
  schemaVersion: 1,
  version: "2.102.0",
  assets: {
    "darwin/arm64": {
      target: "macOS_arm64",
      sha256:
        "da922c20d1792e5b2cbf375593d7a658acf034c12c84e007e71c76ef959c337e",
      binarySha256:
        "8a4258433c81106343144857750316241759d06dcf16265cf3c4864a8f2f2ad6",
    },
  },
};
test("Darwin ARM64 selects the exact version-bound official ZIP without changing Linux", () => {
  const asset = ghAsset(versions, "darwin", "arm64", hostAssets);
  assert.equal(asset.name, "gh_2.102.0_macOS_arm64.zip");
  assert.equal(asset.sha256, hostAssets.assets["darwin/arm64"].sha256);
  assert.equal(
    asset.binarySha256,
    hostAssets.assets["darwin/arm64"].binarySha256,
  );
  assert.deepEqual(
    ghAsset(versions, "linux", "x64", hostAssets),
    ghAsset(versions, "linux", "x64"),
  );
});

import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractGh, verifyGhVersion } from "./setup-gh.mjs";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [name, mutate] of Object.entries({
  "missing metadata": () => undefined,
  "unknown schema": (m) => {
    m.schemaVersion = 2;
    return m;
  },
  "different version": (m) => {
    m.version = "2.103.0";
    return m;
  },
  "unknown metadata field": (m) => {
    m.url = "https://other.invalid";
    return m;
  },
  "wrong target": (m) => {
    m.assets["darwin/arm64"].target = "macOS_amd64";
    return m;
  },
  "unknown host authority": (m) => {
    m.assets["linux/amd64"] = {};
    return m;
  },
  "missing archive digest": (m) => {
    delete m.assets["darwin/arm64"].sha256;
    return m;
  },
  "missing binary digest": (m) => {
    delete m.assets["darwin/arm64"].binarySha256;
    return m;
  },
  "unknown entry field": (m) => {
    m.assets["darwin/arm64"].command = "other";
    return m;
  },
}))
  test(`Darwin tool holds ${name}`, () =>
    assert.throws(() =>
      ghAsset(versions, "darwin", "arm64", mutate(structuredClone(hostAssets))),
    ));
test("unsupported OS/architectures and mutable versions remain held", () => {
  for (const [os, arch] of [
    ["darwin", "x64"],
    ["darwin", "ia32"],
    ["win32", "arm64"],
    ["freebsd", "x64"],
    ["linux", "arm"],
  ])
    assert.throws(() => ghAsset(versions, os, arch, hostAssets));
  assert.throws(() =>
    ghAsset({ ...versions, gh: "latest" }, "darwin", "arm64", hostAssets),
  );
});
test("Darwin ZIP download retains checksum and size limits before extraction", async () => {
  const asset = { ...ghAsset(versions, "darwin", "arm64", hostAssets), sha256 };
  assert.deepEqual(
    await downloadGh(asset, async () => new Response(bytes)),
    bytes,
  );
  await assert.rejects(
    downloadGh(asset, async () => new Response("wrong")),
    /checksum mismatch/,
  );
  await assert.rejects(
    downloadGh(
      asset,
      async () =>
        new Response("not consumed", {
          headers: { "content-length": String(32 * 1024 * 1024 + 1) },
        }),
    ),
    /exceeds its limit/,
  );
  await assert.rejects(
    downloadGh(asset, async () => ({
      ok: true,
      headers: new Headers(),
      body: null,
    })),
    /body is unavailable/,
  );
});
const macho = (cpu = 0x0100000c, magic = 0xfeedfacf) => {
  const value = Buffer.alloc(16);
  value.writeUInt32LE(magic);
  value.writeUInt32LE(cpu, 4);
  return value;
};
test("ZIP extraction writes only the exact verified thin ARM64 member and never overwrites", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "gh-zip-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binary = macho(),
    asset = {
      ...ghAsset(versions, "darwin", "arm64", hostAssets),
      binarySha256: digest(binary),
    },
    calls = [];
  const execute = (command, args, options) => {
    calls.push({ command, args, options });
    return binary;
  };
  const target = await extractGh(asset, "/owned/archive.zip", root, execute);
  assert.deepEqual(await readFile(target), binary);
  assert.equal(calls[0].command, "/usr/bin/unzip");
  assert.deepEqual(calls[0].args, [
    "-p",
    "/owned/archive.zip",
    "gh_2.102.0_macOS_arm64/bin/gh",
  ]);
  assert.equal(calls[0].options.maxBuffer, 64 * 1024 * 1024);
  assert.equal(calls[0].options.timeout, 30000);
  await assert.rejects(
    extractGh(asset, "/owned/archive.zip", root, execute),
    /EEXIST/,
  );
  assert.deepEqual(await readFile(target), binary);
});
test("binary digest, architecture, format and bounded extraction errors hold before install", async (t) => {
  for (const binary of [
    macho(0x01000007),
    macho(0x0100000c, 0xcafebabe),
    Buffer.from("short"),
  ]) {
    const root = await mkdtemp(path.join(tmpdir(), "gh-zip-reject-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const asset = {
      ...ghAsset(versions, "darwin", "arm64", hostAssets),
      binarySha256: digest(binary),
    };
    await assert.rejects(
      extractGh(asset, "/owned/archive.zip", root, () => binary),
      /not thin Mach-O ARM64/,
    );
    await assert.rejects(access(path.join(root, "gh")), /ENOENT/);
  }
  const root = await mkdtemp(path.join(tmpdir(), "gh-zip-hash-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const asset = ghAsset(versions, "darwin", "arm64", hostAssets);
  await assert.rejects(
    extractGh(asset, "/owned/archive.zip", root, () => macho()),
    /binary checksum mismatch/,
  );
  await assert.rejects(
    extractGh(asset, "/owned/archive.zip", root, () => {
      throw Error("bounded unzip failure");
    }),
    /bounded unzip failure/,
  );
  await assert.rejects(access(path.join(root, "gh")), /ENOENT/);
});
test("Linux extraction argv remains unchanged and exact version probes fail closed", async () => {
  const calls = [],
    asset = ghAsset(versions, "linux", "x64");
  assert.equal(
    await extractGh(asset, "/owned/archive.tar.gz", "/owned/root", (...args) =>
      calls.push(args),
    ),
    "/owned/root/gh",
  );
  assert.deepEqual(calls, [
    [
      "tar",
      [
        "-xzf",
        "/owned/archive.tar.gz",
        "-C",
        "/owned/root",
        "--strip-components=2",
        "--no-same-owner",
        "gh_2.102.0_linux_amd64/bin/gh",
      ],
      { stdio: "pipe" },
    ],
  ]);
  assert.equal(
    verifyGhVersion(
      "/owned/gh",
      "2.102.0",
      () => "gh version 2.102.0 (fixture)\nother",
    ),
    "gh version 2.102.0 (fixture)",
  );
  for (const value of [
    "gh version 2.103.0 (wrong)",
    "gh version 2.102.00 (prefix)",
    "gh version 2.102.0-malicious",
  ])
    assert.throws(
      () => verifyGhVersion("/owned/gh", "2.102.0", () => value),
      /version differs/,
    );
});

test("native macOS qualification uses the shared action and owns its receipt without image changes", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const job = workflow.split("\n  host-gh-darwin-arm64:")[1];
  assert.ok(job);
  assert.match(job, /runs-on: macos-15/);
  assert.match(job, /uses: \.\/actions\/setup-gh/);
  assert.ok(
    job.indexOf("uses: ./actions/setup-gh") <
      job.indexOf("run: node scripts/verify-host-gh.mjs"),
  );
  assert.ok(
    !job.includes("secrets.") &&
      !job.includes("GH_TOKEN") &&
      !job.includes("GITHUB_TOKEN"),
  );
  assert.match(job, /path: reports\/host-gh-darwin-arm64.json/);
  const data = JSON.parse(
    await readFile(new URL("../versions.json", import.meta.url), "utf8"),
  );
  const hosts = JSON.parse(
    await readFile(new URL("../gh-host-assets.json", import.meta.url), "utf8"),
  );
  assert.equal(
    ghAsset(data, "darwin", "arm64", hosts).binarySha256,
    hostAssets.assets["darwin/arm64"].binarySha256,
  );
  assert.deepEqual(data.platforms, ["linux/amd64", "linux/arm64"]);
});
