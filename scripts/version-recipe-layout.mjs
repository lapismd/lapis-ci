import { createRequire } from "node:module";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateVersionOutputs } from "./version-recipe-outputs.mjs";
import { validateAiRecipeProfile } from "./ai-version-recipe.mjs";
import { validateDirectRecipeCase } from "./version-recipe-command.mjs";

export function selectRecipeCase(data, name) {
  if (data.schemaVersion !== 1 || !Object.hasOwn(data.cases ?? {}, name))
    throw Error("Select a reviewed version recipe case");
  const selected = data.cases[name];
  if (
    ![
      "lapismd/lapis-plugins",
      "lapismd/design-core",
      "lapismd/mira-mde",
      "lapismd/lapis-plugin-tasks",
      "lapismd/lapis-plugin-docs",
      "lapismd/lapis-ai",
      "lapismd/agent-ui",
    ].includes(selected.repository) ||
    !/^[a-f0-9]{40}$/.test(selected.sourceSha ?? "") ||
    !/^pnpm@\d+\.\d+\.\d+$/.test(selected.qualification?.packageManager ?? "")
  )
    throw Error(
      "Recipe coordinates and package manager must be immutable reviewed values",
    );
  if (
    selected.ignorePnpmfile !== undefined &&
    typeof selected.ignorePnpmfile !== "boolean"
  )
    throw Error("Frozen install hook policy must be explicit");
  if (
    selected.strictPeerDependencies !== undefined &&
    (typeof selected.strictPeerDependencies !== "boolean" ||
      (selected.strictPeerDependencies &&
        selected.repository !== "lapismd/lapis-plugin-docs"))
  )
    throw Error("Strict peer qualification requires the reviewed Docs policy");
  validateDirectRecipeCase(selected);
  validateVersionOutputs(selected.versionOutputs ?? []);
  validateAiRecipeProfile(selected);
  if (
    !/^\.changeset\/[a-zA-Z0-9_-]+\.md$/.test(selected.pending?.path ?? "") ||
    selected.pending.path === ".changeset/README.md" ||
    !/^[a-f0-9]{64}$/.test(selected.pending?.sha256 ?? "") ||
    (selected.historicalNoteSourceSha &&
      !/^[a-f0-9]{40}$/.test(selected.historicalNoteSourceSha))
  )
    throw Error("Recipe requires exact immutable pending-note provenance");
  const checks = selected.afterVersionChecks ?? [];
  if (
    JSON.stringify(checks) !== "[]" &&
    JSON.stringify(checks) !==
      JSON.stringify([
        ["exec", "node", "scripts/sync-release-versions.mjs", "--check"],
      ])
  )
    throw Error(
      "Only the reviewed source metadata check may follow version preparation",
    );
  return selected;
}

// Resolve the package-discovery implementation through this installed CLI,
// retaining its v1/v3 workspace semantics rather than inventing package globs.
export async function discoverRecipeManifests(root, getPackages) {
  const source = await realpath(root);
  if (!getPackages) {
    const require = createRequire(
      await realpath(
        path.join(source, "node_modules/@changesets/cli/package.json"),
      ),
    );
    const mod = await import(
      pathToFileURL(require.resolve("@manypkg/get-packages")).href
    );
    getPackages = mod.getPackages ?? mod.default?.getPackages;
  }
  if (typeof getPackages !== "function")
    throw Error("Installed CLI package discovery is unavailable");
  const selected = await getPackages(source);
  if (!Array.isArray(selected.packages))
    throw Error("Installed CLI returned no package inventory");
  const directories = new Set([source]);
  for (const pkg of selected.packages) {
    const dir = await realpath(pkg.dir);
    if (dir !== source && !dir.startsWith(source + path.sep))
      throw Error("Recipe package lies outside its source checkout");
    directories.add(dir);
  }
  const names = new Set(),
    manifests = [];
  for (const dir of directories) {
    const file = path.join(dir, "package.json"),
      pkg = JSON.parse(await readFile(file, "utf8"));
    if (!pkg.name || names.has(pkg.name))
      throw Error("Duplicate or missing source package name");
    names.add(pkg.name);
    manifests.push({
      name: pkg.name,
      file,
      oldVersion: pkg.version,
      changelog: path.join(dir, "CHANGELOG.md"),
    });
  }
  return manifests;
}
