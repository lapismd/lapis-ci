import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function ghAsset(
  versions,
  platform = process.platform,
  arch = process.arch,
  hostAssets = undefined,
) {
  if (platform === "darwin") {
    const pin = hostAssets?.assets?.["darwin/arm64"];
    const keys = (value, expected) =>
      value &&
      !Array.isArray(value) &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify([...expected].sort());
    if (
      arch !== "arm64" ||
      !/^\d+\.\d+\.\d+$/.test(versions.gh ?? "") ||
      !keys(hostAssets, ["schemaVersion", "version", "assets"]) ||
      hostAssets.schemaVersion !== 1 ||
      hostAssets.version !== versions.gh ||
      !keys(hostAssets.assets, ["darwin/arm64"]) ||
      !keys(pin, ["target", "sha256", "binarySha256"]) ||
      pin.target !== "macOS_arm64" ||
      !/^[a-f0-9]{64}$/.test(pin.sha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(pin.binarySha256 ?? "")
    )
      throw Error("Unsupported or unpinned Darwin GitHub CLI toolchain");
    const name = `gh_${versions.gh}_${pin.target}.zip`;
    return {
      version: versions.gh,
      name,
      sha256: pin.sha256,
      binarySha256: pin.binarySha256,
      format: "zip",
      root: name.slice(0, -4),
      url: `https://github.com/cli/cli/releases/download/v${versions.gh}/${name}`,
    };
  }
  const architecture = { x64: "amd64", arm64: "arm64" }[arch];
  const pin = versions.ghAssets?.[`linux/${architecture}`];
  if (
    platform !== "linux" ||
    !architecture ||
    !/^\d+\.\d+\.\d+$/.test(versions.gh ?? "") ||
    !/^[a-f0-9]{64}$/.test(pin?.sha256 ?? "") ||
    pin.target !== `linux_${architecture}`
  )
    throw Error("Unsupported or unpinned GitHub CLI toolchain");
  const name = `gh_${versions.gh}_${pin.target}.tar.gz`;
  return {
    version: versions.gh,
    name,
    sha256: pin.sha256,
    root: name.slice(0, -7),
    url: `https://github.com/cli/cli/releases/download/v${versions.gh}/${name}`,
  };
}

export async function downloadGh(asset, fetcher = fetch) {
  const request = (url, headers = {}) =>
    fetcher(url, { headers, signal: AbortSignal.timeout(30000) });
  let response;
  try {
    response = await request(asset.url);
  } catch {
    /* The bounded official-asset fallback retains the same checksum. */
  }
  if (!response?.ok) {
    const release = await request(
      `https://api.github.com/repos/cli/cli/releases/tags/v${asset.version}`,
      { Accept: "application/vnd.github+json" },
    );
    if (!release.ok) throw Error("Pinned GitHub CLI release lookup failed");
    const matches =
      (await release.json()).assets?.filter(
        (entry) => entry.name === asset.name,
      ) ?? [];
    if (
      matches.length !== 1 ||
      !/^https:\/\/api\.github\.com\/repos\/cli\/cli\/releases\/assets\/\d+$/.test(
        matches[0].url,
      )
    )
      throw Error("Pinned GitHub CLI asset is absent or ambiguous");
    response = await request(matches[0].url, {
      Accept: "application/octet-stream",
    });
  }
  if (!response.ok) throw Error("Pinned GitHub CLI asset download failed");
  let bytes;
  if (asset.format === "zip") {
    const max = 32 * 1024 * 1024;
    if (Number(response.headers?.get("content-length") ?? 0) > max)
      throw Error("Pinned GitHub CLI ZIP exceeds its limit");
    const reader = response.body?.getReader();
    if (!reader) throw Error("Pinned GitHub CLI ZIP body is unavailable");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) throw Error("Pinned GitHub CLI ZIP exceeds its limit");
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel();
    }
    bytes = Buffer.concat(chunks);
  } else bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    throw Error("Pinned GitHub CLI archive checksum mismatch");
  return bytes;
}

export async function extractGh(asset, archive, root, execute = execFileSync) {
  const binary = path.join(root, "gh");
  if (asset.format === "zip") {
    const bytes = execute(
      "/usr/bin/unzip",
      ["-p", archive, `${asset.root}/bin/gh`],
      { stdio: "pipe", maxBuffer: 64 * 1024 * 1024, timeout: 30000 },
    );
    if (createHash("sha256").update(bytes).digest("hex") !== asset.binarySha256)
      throw Error("Pinned GitHub CLI binary checksum mismatch");
    if (
      bytes.length < 8 ||
      bytes.readUInt32LE(0) !== 0xfeedfacf ||
      bytes.readUInt32LE(4) !== 0x0100000c
    )
      throw Error("Pinned GitHub CLI binary is not thin Mach-O ARM64");
    await writeFile(binary, bytes, { flag: "wx" });
  } else {
    execute(
      "tar",
      [
        "-xzf",
        archive,
        "-C",
        root,
        "--strip-components=2",
        "--no-same-owner",
        `${asset.root}/bin/gh`,
      ],
      { stdio: "pipe" },
    );
  }
  return binary;
}
export function verifyGhVersion(binary, expected, execute = execFileSync) {
  const version = execute(binary, ["--version"], { encoding: "utf8" }).split(
    "\n",
  )[0];
  if (!version.startsWith(`gh version ${expected} `))
    throw Error(
      "Installed GitHub CLI version differs from its verified archive",
    );
  return version;
}

async function main() {
  const versions = JSON.parse(
    await readFile(new URL("../versions.json", import.meta.url), "utf8"),
  );
  const hostAssets =
    process.platform === "darwin"
      ? JSON.parse(
          await readFile(
            new URL("../gh-host-assets.json", import.meta.url),
            "utf8",
          ),
        )
      : undefined;
  const asset = ghAsset(versions, process.platform, process.arch, hostAssets);
  const bytes = await downloadGh(asset);
  const parent = process.env.RUNNER_TEMP ?? tmpdir();
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "lapis-ci-gh-"));
  const archive = path.join(root, asset.name),
    binary = path.join(root, "gh");
  await writeFile(archive, bytes);
  await extractGh(asset, archive, root);
  await chmod(binary, 0o755);
  const version = verifyGhVersion(binary, asset.version);
  await rm(archive);
  if (process.env.GITHUB_PATH)
    await appendFile(process.env.GITHUB_PATH, `${root}\n`);
  console.log(JSON.stringify({ binary, version }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
