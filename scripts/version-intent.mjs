import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverRecipeManifests } from "./version-recipe-layout.mjs";

/** Interpret the installed CLI's plan, including unchanged-version dependents. */
export function hasVersionIntent(plan, manifests, semver, config = {}) {
  if (
    !Array.isArray(plan?.changesets) ||
    !Array.isArray(plan.releases) ||
    !Array.isArray(manifests) ||
    !manifests.length ||
    typeof semver?.valid !== "function" ||
    typeof semver.gt !== "function"
  )
    throw Error("Invalid Changesets release intent evidence");
  const source = new Map();
  for (const item of manifests) {
    if (
      !item?.name ||
      source.has(item.name) ||
      (item.oldVersion !== undefined && !semver.valid(item.oldVersion))
    )
      throw Error("Invalid source package inventory");
    source.set(item.name, item.oldVersion);
  }
  const notes = new Set();
  for (const note of plan.changesets) {
    if (
      !note ||
      typeof note.id !== "string" ||
      !note.id ||
      notes.has(note.id) ||
      typeof note.summary !== "string" ||
      !Array.isArray(note.releases) ||
      note.releases.some(
        (release) =>
          !release ||
          !source.has(release.name) ||
          !["patch", "minor", "major"].includes(release.type),
      )
    )
      throw Error("Invalid Changesets note evidence");
    notes.add(note.id);
  }
  // Linked/fixed packages may report their group's highest version as oldVersion.
  const aligned = new Map(source);
  for (const group of [...(config.linked ?? []), ...(config.fixed ?? [])]) {
    if (
      !Array.isArray(group) ||
      !group.length ||
      group.some((name) => !source.has(name) || !semver.valid(source.get(name)))
    )
      throw Error("Invalid linked package inventory");
    const highest = group
      .map((name) => source.get(name))
      .reduce((a, b) => (semver.gt(a, b) ? a : b));
    for (const name of group) aligned.set(name, highest);
  }
  const seen = new Set();
  for (const release of plan.releases) {
    if (
      !release ||
      !source.has(release.name) ||
      seen.has(release.name) ||
      !["patch", "minor", "major", "none"].includes(release.type) ||
      !semver.valid(release.oldVersion) ||
      !semver.valid(release.newVersion) ||
      ![source.get(release.name), aligned.get(release.name)].includes(
        release.oldVersion,
      ) ||
      (release.type === "none"
        ? release.newVersion !== release.oldVersion
        : !semver.gt(release.newVersion, release.oldVersion))
    )
      throw Error("Unexpected Changesets version target");
    seen.add(release.name);
  }
  // A `none` entry can still require dependency-range rewrites in a private package.
  // Empty note files alone produce no release records and must not mint a writer.
  return plan.releases.length > 0;
}

/** Read-only; caller must first qualify the runtime and frozen source inputs. */
export async function inspectVersionIntent(root) {
  const source = await realpath(root);
  const require = createRequire(
    await realpath(
      path.join(source, "node_modules/@changesets/cli/package.json"),
    ),
  );
  const semver = require("semver");
  const manifests = await discoverRecipeManifests(source);
  const config = JSON.parse(
    await readFile(path.join(source, ".changeset/config.json"), "utf8"),
  );
  const temporary = await mkdtemp(path.join(tmpdir(), "lapis-version-intent-"));
  try {
    const report = path.join(temporary, "status.json");
    execFileSync(
      process.execPath,
      [
        path.join(source, "node_modules/@changesets/cli/bin.js"),
        "status",
        "--output",
        report,
      ],
      {
        cwd: source,
        stdio: "pipe",
        timeout: 60_000,
        killSignal: "SIGKILL",
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const metadata = await stat(report);
    if (!metadata.isFile() || metadata.size > 4 * 1024 * 1024)
      throw Error("Changesets release intent report exceeds its bound");
    return hasVersionIntent(
      JSON.parse(await readFile(report, "utf8")),
      manifests,
      semver,
      config,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
