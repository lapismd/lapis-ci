#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";

const versions = JSON.parse(
  await readFile("/usr/local/share/lapis-ci/versions.json", "utf8"),
);

assertEqual("Node", process.version, `v${versions.node}`);
assertEqual("pnpm", command("pnpm", ["--version"]), versions.pnpm);
assertEqual(
  "Playwright",
  command("playwright", ["--version"]),
  `Version ${versions.playwright}`,
);
assertEqual("mdBook", command("mdbook", ["--version"]), `mdbook v${versions.mdbook}`);
const ghVersion = command("gh", ["--version"]).split("\n")[0].split(" ")[2];
assertEqual("GitHub CLI", ghVersion, versions.gh);

for (const executable of [
  "bash",
  "curl",
  "git",
  "jq",
  "unzip",
  "xvfb-run",
  "zip",
]) {
  command("bash", ["-lc", `command -v ${executable}`]);
}

await access(process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/ms-playwright");
const browserEntries = await readdir(
  process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/ms-playwright",
);
if (!browserEntries.some((entry) => entry.startsWith("chromium-"))) {
  throw new Error("Lapis CI image is missing the pinned Chromium browser.");
}
if (!browserEntries.some((entry) => entry.startsWith("chromium_headless_shell-"))) {
  throw new Error("Lapis CI image is missing the Chromium headless shell.");
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      node: versions.node,
      pnpm: versions.pnpm,
      playwright: versions.playwright,
      mdbook: versions.mdbook,
      gh: versions.gh,
      platform: `${process.platform}/${process.arch}`,
    },
    null,
    2,
  ),
);

function command(executable, args) {
  return execFileSync(executable, args, { encoding: "utf8" }).trim();
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}
