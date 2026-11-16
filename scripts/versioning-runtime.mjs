import {
  access,
  appendFile,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versionRecipeCommand } from "./version-recipe-command.mjs";
import { inspectVersionIntent } from "./version-intent.mjs";

const keys = (value, names) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => names.includes(key));
const digest = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
const safePath = (value) =>
  typeof value === "string" &&
  /^(?:[\w.-]+\/)*[\w.@-]+$/.test(value) &&
  !value.split("/").some((part) => part === "." || part === "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateRuntimeContracts(contracts) {
  if (
    !keys(contracts, ["schemaVersion", "nodeMajor", "versions"]) ||
    contracts.schemaVersion !== 1 ||
    contracts.nodeMajor !== 24 ||
    !keys(contracts.versions, Object.keys(contracts.versions ?? {})) ||
    !Object.keys(contracts.versions).length
  )
    throw Error("Unsupported reviewed runtime contracts");
  for (const [version, contract] of Object.entries(contracts.versions)) {
    if (
      !/^\d+\.\d+\.\d+$/.test(version) ||
      !keys(contract, [
        "engines",
        "integrity",
        "sourceSha",
        "files",
        "nodeMajors",
      ]) ||
      (contract.nodeMajors !== undefined &&
        (!Array.isArray(contract.nodeMajors) ||
          !contract.nodeMajors.includes(24) ||
          new Set(contract.nodeMajors).size !== contract.nodeMajors.length ||
          contract.nodeMajors.some((major) => ![22, 24].includes(major)))) ||
      !(contract.engines === null || typeof contract.engines === "string") ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(contract.integrity ?? "") ||
      !/^[a-f0-9]{40}$/.test(contract.sourceSha ?? "") ||
      !keys(contract.files, Object.keys(contract.files ?? {})) ||
      !contract.files["bin.js"] ||
      !contract.files["package.json"] ||
      Object.entries(contract.files).some(
        ([file, hash]) => !safePath(file) || !digest(hash),
      )
    )
      throw Error("Unsupported reviewed Changesets bytes");
  }
  return contracts;
}

async function assertNodeProject(root) {
  for (
    let directory = path.resolve(root);
    ;
    directory = path.dirname(directory)
  ) {
    for (const file of ["deno.json", "deno.jsonc"]) {
      try {
        await access(path.join(directory, file));
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      throw Error("Deno formatter input requires owning-source qualification");
    }
    if (path.dirname(directory) === directory) return;
  }
}

async function digestFile(root, file) {
  if (!safePath(file)) throw Error("Unsafe version qualification path");
  const base = await realpath(root),
    target = await realpath(path.join(base, file));
  if (!target.startsWith(base + path.sep))
    throw Error("Version qualification path escapes its source");
  return sha256(await readFile(target));
}

async function executableFiles(root, directory = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules")
      files.push(...(await executableFiles(root, file)));
    else if (
      entry.isFile() &&
      (file === "package.json" || /\.(?:cjs|mjs|js)$/.test(file))
    )
      files.push(file);
  }
  return files.sort();
}

/** Validate source-bound inputs only; never execute, rewrite or publish a recipe. */
export async function guardVersioningInputs(
  root,
  qualification,
  contracts,
  nodeVersion = process.versions.node,
) {
  validateRuntimeContracts(contracts);
  if (
    !keys(qualification, [
      "schemaVersion",
      "cliVersion",
      "packageManager",
      "configSha256",
      "scripts",
      "files",
      "nodeMajor",
      "mode",
      "argv",
    ]) ||
    qualification.schemaVersion !== 1 ||
    !contracts.versions[qualification.cliVersion]
  )
    throw Error("Version preparation needs a reviewed Changesets version");
  versionRecipeCommand(qualification);
  const selectedMajor = qualification.nodeMajor ?? contracts.nodeMajor;
  const reviewedMajors = contracts.versions[qualification.cliVersion]
    .nodeMajors ?? [contracts.nodeMajor];
  if (!reviewedMajors.includes(selectedMajor))
    throw Error(
      `Changesets ${qualification.cliVersion} has no reviewed Node ${selectedMajor} runtime`,
    );
  if (Number(nodeVersion.split(".")[0]) !== selectedMajor)
    throw Error(
      `Version preparation requires the reviewed Node ${selectedMajor} runtime`,
    );
  await assertNodeProject(root);
  if (
    !digest(qualification.configSha256) ||
    !/^pnpm@\d+\.\d+\.\d+(?:\+sha\d+\.[a-f0-9]+)?$/.test(
      qualification.packageManager ?? "",
    ) ||
    !keys(qualification.scripts, Object.keys(qualification.scripts ?? {})) ||
    (qualification.mode !== "direct" &&
      !qualification.scripts["release:version"]) ||
    Object.entries(qualification.scripts).some(
      ([name, command]) =>
        !/^[\w:-]+$/.test(name) ||
        typeof command !== "string" ||
        !command.length ||
        command.length > 4096,
    ) ||
    !keys(qualification.files, Object.keys(qualification.files ?? {})) ||
    !Object.keys(qualification.files).length ||
    Object.entries(qualification.files).some(
      ([file, hash]) => !safePath(file) || !digest(hash),
    )
  )
    throw Error("Invalid source-owned recipe qualification path or binding");
  if (
    (await digestFile(root, ".changeset/config.json")) !==
    qualification.configSha256
  )
    throw Error(
      "Changesets configuration changed; requalify in its owning source",
    );
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  if (
    manifest.packageManager !== qualification.packageManager ||
    Object.entries(qualification.scripts).some(
      ([name, command]) => manifest.scripts?.[name] !== command,
    )
  )
    throw Error(
      "Version recipe command or package manager changed; requalify in its owning source",
    );
  for (const name of Object.keys(qualification.scripts))
    for (const prefix of ["pre", "post"]) {
      const lifecycle = prefix + name;
      if (
        manifest.scripts?.[lifecycle] &&
        qualification.scripts[lifecycle] !== manifest.scripts[lifecycle]
      )
        throw Error(
          "Version recipe lifecycle changed; requalify in its owning source",
        );
    }
  for (const [file, hash] of Object.entries(qualification.files))
    if ((await digestFile(root, file)) !== hash)
      throw Error(
        "Version recipe source bytes changed; requalify in its owning source",
      );
  const folder = path.join(root, "node_modules/@changesets/cli"),
    contract = contracts.versions[qualification.cliVersion];
  if (
    JSON.stringify(await executableFiles(folder)) !==
    JSON.stringify(Object.keys(contract.files).sort())
  )
    throw Error("Installed Changesets executable bytes changed");
  for (const [file, hash] of Object.entries(contract.files))
    if ((await digestFile(folder, file)) !== hash)
      throw Error("Installed Changesets bytes changed or unavailable");
  const pkg = JSON.parse(
    await readFile(path.join(folder, "package.json"), "utf8"),
  );
  if (
    pkg.name !== "@changesets/cli" ||
    pkg.version !== qualification.cliVersion ||
    pkg.bin?.changeset !== "bin.js" ||
    (pkg.engines?.node ?? null) !== contract.engines ||
    ["preinstall", "install", "postinstall"].some((name) => pkg.scripts?.[name])
  )
    throw Error("Installed Changesets does not match the reviewed runtime");
  return {
    version: pkg.version,
    node: nodeVersion,
    recipe: "source-bound-inputs",
  };
}

/** Opt-in planning is fenced by the same source/runtime guard on both sides. */
export async function guardVersioningWithIntent(
  root,
  qualification,
  contracts,
  detect = false,
  nodeVersion = process.versions.node,
  inspect = inspectVersionIntent,
) {
  if (typeof detect !== "boolean") throw Error("Invalid release intent flag");
  const result = await guardVersioningInputs(
    root,
    qualification,
    contracts,
    nodeVersion,
  );
  if (!detect) return result;
  const pending = await inspect(root);
  if (typeof pending !== "boolean")
    throw Error("Invalid release intent result");
  await guardVersioningInputs(root, qualification, contracts, nodeVersion);
  return { ...result, hasChangesets: pending };
}

async function main() {
  const flag = process.env.LAPIS_VERSIONING_DETECT_INTENT ?? "false";
  if (!["false", "true"].includes(flag))
    throw Error("Invalid release intent flag");
  if (flag === "true" && !process.env.GITHUB_OUTPUT)
    throw Error("Release intent requires a GitHub step output file");
  const workspace = await realpath(
    process.env.GITHUB_WORKSPACE ?? process.cwd(),
  );
  const root = await realpath(
    path.resolve(workspace, process.env.LAPIS_VERSIONING_ROOT ?? "."),
  );
  if (root !== workspace && !root.startsWith(workspace + path.sep))
    throw Error("Version source must remain within its workspace");
  const file = process.env.LAPIS_VERSIONING_QUALIFICATION;
  if (!safePath(file))
    throw Error("A source-owned recipe qualification path is required");
  await digestFile(root, file);
  const qualification = JSON.parse(
    await readFile(path.join(root, file), "utf8"),
  );
  const contracts = JSON.parse(
    await readFile(
      new URL("../changesets-runtime.json", import.meta.url),
      "utf8",
    ),
  );
  const result = await guardVersioningWithIntent(
    root,
    qualification,
    contracts,
    flag === "true",
  );
  if (flag === "true") {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `hasChangesets=${result.hasChangesets}\n`,
    );
    console.log(
      `Genuine source version/dependency intent: ${result.hasChangesets}`,
    );
  }
  console.log(
    `Reviewed Node runtime accepted for Changesets ${result.version}; source-bound recipe inputs unchanged.`,
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
