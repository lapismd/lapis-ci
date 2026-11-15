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
) {
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
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    throw Error("Pinned GitHub CLI archive checksum mismatch");
  return bytes;
}

async function main() {
  const versions = JSON.parse(
    await readFile(new URL("../versions.json", import.meta.url), "utf8"),
  );
  const asset = ghAsset(versions);
  const bytes = await downloadGh(asset);
  const parent = process.env.RUNNER_TEMP ?? tmpdir();
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "lapis-ci-gh-"));
  const archive = path.join(root, asset.name),
    binary = path.join(root, "gh");
  await writeFile(archive, bytes);
  execFileSync(
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
  await chmod(binary, 0o755);
  const version = execFileSync(binary, ["--version"], {
    encoding: "utf8",
  }).split("\n")[0];
  if (!version.startsWith(`gh version ${asset.version} `))
    throw Error(
      "Installed GitHub CLI version differs from its verified archive",
    );
  await rm(archive);
  if (process.env.GITHUB_PATH)
    await appendFile(process.env.GITHUB_PATH, `${root}\n`);
  console.log(JSON.stringify({ binary, version }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
