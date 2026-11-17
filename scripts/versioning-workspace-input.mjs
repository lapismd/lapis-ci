import { createHash } from "node:crypto";

const exact = (value, names) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name));
const fail = (reason) => {
  throw Error(`Development workspace input: ${reason}`);
};
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const version = (text) => {
  if (
    typeof text !== "string" ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(text)
  )
    fail("stable exact version required");
  const parts = text.split(".").map(Number);
  if (!parts.every(integer)) fail("invalid version coordinates");
  return parts;
};

export function validateWorkspacePolicy(policy) {
  if (
    !exact(policy, ["schemaVersion", "sha256", "developmentOverride"]) ||
    policy.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(policy.sha256 ?? "") ||
    !exact(policy.developmentOverride, ["dependency", "series", "minimumPatch"])
  )
    fail("unsupported source policy");
  const { dependency, series, minimumPatch } = policy.developmentOverride;
  if (
    !/^@(?:lapismd|lapis-notes)\/[a-z0-9][a-z0-9._-]*$/.test(
      dependency ?? "",
    ) ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(series ?? "") ||
    !series.split(".").map(Number).every(integer) ||
    !integer(minimumPatch)
  )
    fail("invalid source selector");
  return policy.developmentOverride;
}

// Preserve every byte except one source-reviewed, pinned development version.
// No YAML evaluation, scripts, package imports, network or writes are involved.
export function developmentWorkspaceDigest(bytes, policy, manifest, installed) {
  const { dependency, series, minimumPatch } = validateWorkspacePolicy(policy);
  if (Buffer.byteLength(bytes) > 256 * 1024) fail("oversized workspace input");
  const text =
    typeof bytes === "string"
      ? bytes
      : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const selected = manifest.devDependencies?.[dependency];
  const [major, minor, patch] = version(selected);
  if (
    `${major}.${minor}` !== series ||
    patch < minimumPatch ||
    Object.hasOwn(manifest.dependencies ?? {}, dependency) ||
    Object.hasOwn(manifest.optionalDependencies ?? {}, dependency) ||
    installed?.name !== dependency ||
    installed?.version !== selected
  )
    fail("development manifest, installed identity or patch scope disagree");
  const lines = text.split("\n");
  const starts = lines.flatMap((line, i) =>
    /^overrides:[ \t]*(?:#.*)?$/.test(line) ? [i] : [],
  );
  if (starts.length !== 1) fail("missing or ambiguous root overrides");
  const start = starts[0];
  let end = lines.findIndex(
    (line, i) => i > start && /^[^ \t\r\n#]/.test(line),
  );
  if (end < 0) end = lines.length;
  const name = dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const key = `(?:${name}|"${name}"|'${name}')`;
  const selector = new RegExp(
    `^(  ${key}:[ \\t]+)(["']?)(\\d+\\.\\d+\\.\\d+)\\2([ \\t]*(?:#.*)?)$`,
  );
  const matches = [];
  for (let i = start + 1; i < end; i++) {
    const match = selector.exec(lines[i]);
    if (match) matches.push({ i, match });
  }
  if (matches.length !== 1 || matches[0].match[3] !== selected)
    fail("missing, ambiguous or mismatched development override");
  const { i, match } = matches[0];
  lines[i] =
    `${match[1]}${match[2]}<development-override>${match[2]}${match[4]}`;
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
