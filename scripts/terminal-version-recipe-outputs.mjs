import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { canonicalHashes } from "./native-version-recipe-outputs.mjs";
import { validateTerminalRecipeProfile } from "./terminal-version-recipe.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (root, file) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));
const releaseChapter = "spec/src/current/contracts/release.md";
const summary = "spec/src/SUMMARY.md";

export async function snapshotTerminalRecipeOutputs(
  root,
  example,
  releases,
  parseToml,
) {
  const tools = validateTerminalRecipeProfile(example);
  assert(tools, "An explicit Terminal profile is required");
  const release = releases.find((item) => item.name === "@lapismd/terminal");
  assert.equal(
    releases.length,
    1,
    "Terminal must prepare exactly its public package",
  );
  assert(release);
  if (!parseToml) {
    const require = createRequire(
      path.join(await realpath(root), "package.json"),
    );
    parseToml = require("@iarna/toml").parse;
  }
  const toml = async (file) =>
    parseToml(await readFile(path.join(root, file), "utf8"));
  const pkg = await json(root, "packages/terminal/package.json"),
    version = pkg.version;
  assert.equal(pkg.name, release.name);
  assert.equal(pkg.publishConfig?.access, "public");
  assert.notEqual(pkg.private, true);
  assert([release.oldVersion, release.newVersion].includes(version));
  for (const file of ["package.json", "examples/desktop/package.json"]) {
    const value = await json(root, file);
    assert.equal(value.private, true);
    assert.equal(
      value.version,
      version,
      "Private package must stay coordinated",
    );
  }
  assert.equal(
    (await json(root, "examples/desktop/src-tauri/tauri.conf.json")).version,
    version,
  );
  const workspace = (await toml("Cargo.toml")).workspace;
  assert.equal(workspace.package.version, version);
  const directories = [
    "crates/lapis-terminal-engine",
    "crates/lapis-terminal-runtime",
    "crates/tauri-plugin-lapis-terminal",
    "examples/desktop/src-tauri",
  ];
  assert.deepEqual([...workspace.members].sort(), [...directories].sort());
  assert.equal(directories.length, tools.cargoPackages);
  const locked = (await toml("Cargo.lock")).package,
    packages = [];
  const names = [
    "lapis-terminal-engine",
    "lapis-terminal-runtime",
    "tauri-plugin-lapis-terminal",
    "lapis-terminal-demo",
  ];
  for (const [index, directory] of directories.entries()) {
    const cargo = await toml(`${directory}/Cargo.toml`);
    assert.equal(cargo.package.name, names[index]);
    assert.equal(cargo.package.version.workspace, true);
    const records = locked.filter(
      (entry) => entry.name === names[index] && !entry.source,
    );
    assert.equal(records.length, 1);
    assert.equal(
      records[0].version,
      version,
      "Native lock must stay coordinated",
    );
    for (const [name, dependency] of Object.entries(cargo.dependencies ?? {}))
      if (names.includes(name))
        assert.equal(
          dependency.version,
          version,
          "Internal Cargo range must stay coordinated",
        );
    packages.push({ name: names[index], path: directory, version });
  }
  const canonical = await canonicalHashes(root);
  assert(canonical[releaseChapter] && canonical[summary]);
  const text = {};
  for (const file of [releaseChapter, summary])
    text[file] = await readFile(path.join(root, file), "utf8");
  assert(text[releaseChapter].includes(`Prepared version: **${version}**.`));
  const hashes = {};
  for (const file of [
    "Cargo.toml",
    "Cargo.lock",
    "package.json",
    "packages/terminal/package.json",
    "packages/terminal/CHANGELOG.md",
    "examples/desktop/package.json",
    "examples/desktop/CHANGELOG.md",
    "examples/desktop/src-tauri/tauri.conf.json",
    "pnpm-lock.yaml",
    ...directories.map((directory) => `${directory}/Cargo.toml`),
  ])
    hashes[file] = hash(await readFile(path.join(root, file)));
  return { version, packages, canonical, hashes, text };
}

export async function verifyTerminalRecipeOutputs(
  root,
  example,
  releases,
  before,
  changes,
  untracked,
  parseToml,
) {
  const after = await snapshotTerminalRecipeOutputs(
    root,
    example,
    releases,
    parseToml,
  );
  const release = releases[0],
    evidence = `spec/src/history/releases/${release.newVersion}.md`;
  assert.equal(before.version, release.oldVersion);
  assert.equal(after.version, release.newVersion);
  assert.equal(
    after.text[releaseChapter],
    before.text[releaseChapter].replace(
      `Prepared version: **${before.version}**.`,
      `Prepared version: **${after.version}**.`,
    ),
    "Release chapter may change only prepared metadata",
  );
  assert.equal(
    after.text[summary],
    before.text[summary] +
      `- [Prepared release ${after.version}](history/releases/${after.version}.md)\n`,
    "Summary may append only the prepared release",
  );
  assert.match(example.releaseRecordSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(
    after.canonical[evidence],
    example.releaseRecordSha256,
    "Release record must match reviewed metadata-only evidence",
  );
  const unchanged = (canonical) =>
    Object.fromEntries(
      Object.entries(canonical).filter(
        ([file]) => ![releaseChapter, summary, evidence].includes(file),
      ),
    );
  assert.deepEqual(
    unchanged(after.canonical),
    unchanged(before.canonical),
    "Version preparation changed other canonical evidence",
  );
  assert(!before.canonical[evidence], "Release record must be new");
  for (const file of [
    "Cargo.toml",
    "Cargo.lock",
    "package.json",
    "packages/terminal/package.json",
    "packages/terminal/CHANGELOG.md",
    "examples/desktop/package.json",
    "examples/desktop/CHANGELOG.md",
    "examples/desktop/src-tauri/tauri.conf.json",
  ])
    assert.notEqual(
      after.hashes[file],
      before.hashes[file],
      `${file} must reflect the prepared release`,
    );
  for (const file of [
    "packages/terminal/CHANGELOG.md",
    "examples/desktop/CHANGELOG.md",
  ])
    assert(
      (await readFile(path.join(root, file), "utf8")).includes(
        `## ${after.version}\n`,
      ),
      "Changelog must name the prepared version",
    );
  const allowed = new Set([
    ...Object.keys(before.hashes),
    releaseChapter,
    summary,
    evidence,
  ]);
  assert(
    changes.every((file) => allowed.has(file)),
    "Terminal recipe changed an unreviewed output",
  );
  assert(
    untracked.every((file) => file === evidence),
    "Terminal recipe created an unreviewed source file",
  );
  return after;
}
