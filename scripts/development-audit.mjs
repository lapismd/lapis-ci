const levels = ["info", "low", "moderate", "high", "critical"];
const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const name = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/;
const stable = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const keys = (object, allowed) =>
  object &&
  typeof object === "object" &&
  !Array.isArray(object) &&
  Object.keys(object).every((key) => allowed.includes(key));
const timestamp = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const relative = (value) =>
  typeof value === "string" &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  value.split("/").every((part) => part && part !== "." && part !== "..");
const dependencyPath = (value) =>
  typeof value === "string" &&
  value.startsWith(".>") &&
  value
    .split(">")
    .slice(1)
    .every((part) => name.test(part));
const publicFinding = (finding) => ({
  advisory: finding.advisory,
  package: finding.package,
  version: finding.version,
  path: finding.path,
  severity: finding.severity,
});

export function validateDevelopmentPolicy(policy) {
  if (
    !keys(policy, ["schemaVersion", "repository", "approvals"]) ||
    policy.schemaVersion !== 1 ||
    !/^lapismd\/[a-z0-9-]+$/.test(policy.repository ?? "") ||
    !Array.isArray(policy.approvals) ||
    policy.approvals.length > 1
  )
    throw Error("Unsupported development audit policy");
  for (const entry of policy.approvals) {
    if (
      !keys(entry, [
        "advisory",
        "package",
        "version",
        "severity",
        "path",
        "scope",
        "vulnerableRange",
        "patchedRange",
        "sourceSha",
        "manifestSha256",
        "lockSha256",
        "approvedAt",
        "expiresAt",
        "authority",
        "record",
      ]) ||
      !/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(
        entry.advisory ?? "",
      ) ||
      !name.test(entry.package ?? "") ||
      !stable.test(entry.version ?? "") ||
      entry.severity !== "low" ||
      entry.scope !== "development-only" ||
      !dependencyPath(entry.path) ||
      entry.path.split(">").at(-1) !== entry.package ||
      typeof entry.vulnerableRange !== "string" ||
      !entry.vulnerableRange ||
      entry.vulnerableRange.length > 128 ||
      entry.patchedRange !== "<0.0.0" ||
      !sha.test(entry.sourceSha) ||
      !digest.test(entry.manifestSha256) ||
      !digest.test(entry.lockSha256) ||
      !timestamp(entry.approvedAt) ||
      !timestamp(entry.expiresAt) ||
      Date.parse(entry.expiresAt) <= Date.parse(entry.approvedAt) ||
      Date.parse(entry.expiresAt) - Date.parse(entry.approvedAt) >
        7 * 86400000 ||
      !["delegated-operator", "explicit-user"].includes(entry.authority) ||
      !relative(entry.record) ||
      !entry.record.startsWith("spec/records/") ||
      !entry.record.endsWith(".md")
    )
      throw Error("Invalid exact development approval");
  }
  return policy;
}

export function parseAuditEvidence(audit) {
  if (
    !audit ||
    audit.error ||
    !keys(audit.advisories, Object.keys(audit.advisories ?? {})) ||
    !Array.isArray(audit.muted) ||
    audit.muted.length ||
    !levels.every(
      (level) =>
        Number.isSafeInteger(audit.metadata?.vulnerabilities?.[level]) &&
        audit.metadata.vulnerabilities[level] >= 0,
    )
  )
    throw Error("Incomplete or suppressed audit evidence");
  const counts = Object.fromEntries(levels.map((level) => [level, 0])),
    findings = [],
    seen = new Set();
  for (const advisory of Object.values(audit.advisories)) {
    if (
      !/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(
        advisory.github_advisory_id ?? "",
      ) ||
      !name.test(advisory.module_name ?? "") ||
      !levels.includes(advisory.severity) ||
      advisory.url !==
        `https://github.com/advisories/${advisory.github_advisory_id}` ||
      typeof advisory.vulnerable_versions !== "string" ||
      !advisory.vulnerable_versions ||
      typeof advisory.patched_versions !== "string" ||
      !advisory.patched_versions ||
      !Array.isArray(advisory.findings) ||
      !advisory.findings.length
    )
      throw Error("Unsupported audit advisory");
    for (const affected of advisory.findings) {
      if (
        !stable.test(affected.version ?? "") ||
        !Array.isArray(affected.paths) ||
        !affected.paths.length
      )
        throw Error("Unsupported audit version/path evidence");
      counts[advisory.severity]++;
      for (const path of affected.paths) {
        if (
          !dependencyPath(path) ||
          path.split(">").at(-1) !== advisory.module_name
        )
          throw Error("Unsupported dependency path");
        const finding = {
          advisory: advisory.github_advisory_id,
          package: advisory.module_name,
          severity: advisory.severity,
          version: affected.version,
          path,
          vulnerableRange: advisory.vulnerable_versions,
          patchedRange: advisory.patched_versions,
        };
        const identity = JSON.stringify(publicFinding(finding));
        if (seen.has(identity)) throw Error("Duplicate audit finding");
        seen.add(identity);
        findings.push(finding);
      }
    }
  }
  if (
    levels.some(
      (level) => counts[level] !== audit.metadata.vulnerabilities[level],
    )
  )
    throw Error("Inconsistent vulnerability counts");
  return findings;
}

function isNewer(candidate, approved) {
  const a = candidate.split(".").map(BigInt),
    b = approved.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** Bounded development graph acceptance, never a source/workflow security analysis. */
export function evaluateDevelopmentAudit({
  full,
  production,
  policy,
  context,
}) {
  const blocked = (reason) => ({
    schemaVersion: 1,
    allowed: false,
    status: "blocked",
    reason,
  });
  try {
    validateDevelopmentPolicy(policy);
    if (
      !sha.test(context.sourceSha) ||
      !digest.test(context.manifestSha256) ||
      !digest.test(context.lockSha256) ||
      !timestamp(context.now)
    )
      return blocked("source-binding-unavailable");
    const findings = parseAuditEvidence(full),
      productionFindings = parseAuditEvidence(production);
    const result = {
      schemaVersion: 1,
      sourceSha: context.sourceSha,
      manifestSha256: context.manifestSha256,
      lockSha256: context.lockSha256,
      checkedAt: context.now,
      rawVulnerabilities: full.metadata.vulnerabilities,
      productionVulnerabilities: production.metadata.vulnerabilities,
      accepted: [],
      retired: [],
    };
    if (policy.repository !== context.repository)
      return { ...result, ...blocked("repository-mismatch") };
    if (productionFindings.length)
      return { ...result, ...blocked("production-finding") };
    if (!findings.length)
      return {
        ...result,
        allowed: true,
        status: "clean",
        retired: policy.approvals.map(publicFinding),
      };
    for (const finding of findings) {
      const entry = policy.approvals.find((a) =>
        ["advisory", "package", "version", "path", "severity"].every(
          (key) => a[key] === finding[key],
        ),
      );
      if (!entry) return { ...result, ...blocked("unapproved-finding") };
      if (
        ["sourceSha", "manifestSha256", "lockSha256"].some(
          (key) => entry[key] !== context[key],
        )
      )
        return { ...result, ...blocked("approval-binding-mismatch") };
      if (
        Date.parse(entry.approvedAt) > Date.parse(context.now) ||
        Date.parse(entry.expiresAt) <= Date.parse(context.now)
      )
        return { ...result, ...blocked("approval-expired-or-not-yet-valid") };
      if (
        finding.patchedRange !== "<0.0.0" ||
        finding.patchedRange !== entry.patchedRange ||
        finding.vulnerableRange !== entry.vulnerableRange
      )
        return { ...result, ...blocked("fix-or-advisory-metadata-changed") };
      const firstHop = finding.path.split(">")[1];
      if (
        !Object.hasOwn(context.manifest.devDependencies ?? {}, firstHop) ||
        ["dependencies", "optionalDependencies", "peerDependencies"].some(
          (field) =>
            [firstHop, finding.package].some((pkg) =>
              Object.hasOwn(context.manifest[field] ?? {}, pkg),
            ),
        )
      )
        return { ...result, ...blocked("runtime-or-unknown-exposure") };
      const registry = context.registry?.[finding.package];
      if (
        !registry ||
        registry.name !== finding.package ||
        !registry.versions ||
        Array.isArray(registry.versions) ||
        registry.versions[finding.version]?.version !== finding.version
      )
        return { ...result, ...blocked("fix-metadata-unavailable") };
      // A successor is conservatively held for review even before an advisory
      // database learns whether it fixes this finding; never wait out a fix.
      if (
        Object.keys(registry.versions)
          .filter((version) => stable.test(version))
          .some((version) => isNewer(version, finding.version))
      )
        return {
          ...result,
          ...blocked("newer-published-version-review-required"),
        };
      result.accepted.push({
        ...publicFinding(finding),
        expiresAt: entry.expiresAt,
        authority: entry.authority,
        record: entry.record,
      });
    }
    return {
      ...result,
      allowed: true,
      status: "temporary-development-acceptance",
    };
  } catch {
    return blocked("policy-or-audit-evidence-unavailable");
  }
}
