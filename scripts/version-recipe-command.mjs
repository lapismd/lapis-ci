import { isDeepStrictEqual } from "node:util";
const direct = ["exec", "changeset", "version"];

/** The reviewed command ABI is data, never a shell or arbitrary argument list. */
export function versionRecipeCommand(qualification) {
  const mode =
    qualification?.mode === undefined ? "script" : qualification.mode;
  if (mode === "script" && qualification.argv === undefined)
    return ["release:version"];
  if (
    mode !== "direct" ||
    qualification.cliVersion !== "2.31.1" ||
    (qualification.nodeMajor !== undefined && qualification.nodeMajor !== 24) ||
    !Array.isArray(qualification.argv) ||
    qualification.argv.length !== direct.length ||
    !qualification.argv.every((value, index) => value === direct[index]) ||
    !qualification.scripts ||
    Array.isArray(qualification.scripts) ||
    typeof qualification.scripts !== "object" ||
    Object.keys(qualification.scripts).length
  )
    throw Error("Unsupported reviewed version command mode or argv");
  return [...direct];
}

export function validateDirectRecipeCase(selected) {
  versionRecipeCommand(selected.qualification);
  if (selected.qualification.mode !== "direct") return;
  const files = selected.qualification.files ?? {},
    closure = selected.closureEvidence,
    stable = [
      "pnpm-workspace.yaml",
      ".prettierrc.json",
      ".prettierignore",
      "patches/bits-ui@2.20.2.patch",
    ],
    required = [
      "package.json",
      "pnpm-lock.yaml",
      ".changeset/config.json",
      ".github/workflows/changesets.yml",
      ".github/workflows/check.yml",
      "packages/agent-ui/package.json",
      "packages/repository-ui/package.json",
      "packages/agent-ui/CHANGELOG.md",
      "packages/repository-ui/CHANGELOG.md",
      ...stable,
    ];
  if (
    !closure ||
    closure.currentSourceSha !== selected.sourceSha ||
    closure.comparison !== "exact-current-tuple" ||
    !isDeepStrictEqual(closure.sourceHashes, closure.currentHashes) ||
    !isDeepStrictEqual(
      Object.keys(closure.sourceHashes ?? {}).sort(),
      required.sort(),
    ) ||
    !isDeepStrictEqual(Object.keys(files).sort(), stable.sort()) ||
    Object.values(closure.sourceHashes ?? {}).some(
      (hash) => !/^[a-f0-9]{64}$/.test(hash),
    ) ||
    stable.some((file) => files[file] !== closure.sourceHashes[file]) ||
    selected.qualification.configSha256 !==
      closure.sourceHashes[".changeset/config.json"]
  )
    throw Error("Direct source bindings are missing or changed");
  const expected = selected.expectedReleases;
  if (
    selected.repository !== "lapismd/agent-ui" ||
    selected.profile ||
    selected.ignorePnpmfile ||
    selected.strictPeerDependencies ||
    selected.afterVersionChecks?.length ||
    selected.versionOutputs?.length ||
    !Array.isArray(expected) ||
    expected.length !== 1 ||
    !expected[0] ||
    typeof expected[0] !== "object" ||
    Array.isArray(expected[0]) ||
    expected[0].name !== "@lapismd/repository-ui" ||
    Object.keys(expected[0]).sort().join() !== "name,newVersion,oldVersion" ||
    !/^\d+\.\d+\.\d+$/.test(expected[0].oldVersion ?? "") ||
    !/^\d+\.\d+\.\d+$/.test(expected[0].newVersion ?? "") ||
    expected[0].oldVersion.split(".").slice(0, 2).join() !==
      expected[0].newVersion.split(".").slice(0, 2).join() ||
    Number(expected[0].newVersion.split(".")[2]) !==
      Number(expected[0].oldVersion.split(".")[2]) + 1
  )
    throw Error("Direct command requires the reviewed Agent UI source profile");
}

export function assertDirectRecipePlan(selected, changes) {
  validateDirectRecipeCase(selected);
  if (selected.qualification.mode !== "direct") return;
  if (
    changes.length !== 1 ||
    ["name", "oldVersion", "newVersion"].some(
      (key) => changes[0][key] !== selected.expectedReleases[0][key],
    )
  )
    throw Error("Direct recipe planned unexpected package versions");
}
