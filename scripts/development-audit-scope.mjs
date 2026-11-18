export const stable = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
export function isNewer(candidate, approved) {
  const a = candidate.split(".").map(BigInt),
    b = approved.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
const ceiling = (entry) =>
  /^<=(\d+\.\d+\.\d+)$/.exec(entry.vulnerableRange ?? "")?.[1];
export function validDevelopmentScope(entry, schema) {
  const duration = Date.parse(entry.expiresAt) - Date.parse(entry.approvedAt);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (entry.severity === "low")
    return (
      duration <= 7 * 86400000 &&
      ["delegated-operator", "explicit-user"].includes(entry.authority)
    );
  const limit = ceiling(entry);
  return (
    schema === 2 &&
    entry.severity === "high" &&
    entry.authority === "explicit-user" &&
    duration <= 2 * 86400000 &&
    stable.test(entry.version ?? "") &&
    stable.test(limit ?? "") &&
    !isNewer(entry.version, limit)
  );
}
export function uniqueDevelopmentApprovals(entries) {
  return (
    entries.filter((entry) => entry.severity === "low").length <= 1 &&
    new Set(
      entries.map((entry) =>
        JSON.stringify([
          entry.advisory,
          entry.package,
          entry.version,
          entry.path,
          entry.severity,
        ]),
      ),
    ).size === entries.length
  );
}
export function developmentSuccessorFloor(entry, registry) {
  if (entry.severity === "low") return entry.version;
  const limit = ceiling(entry);
  return registry.versions[limit]?.version === limit ? limit : null;
}
