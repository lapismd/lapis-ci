import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDevelopmentAudit } from "./development-audit.mjs";

function fixture() {
  const context = {
    repository: "lapismd/example",
    sourceSha: "a".repeat(40),
    manifestSha256: "b".repeat(64),
    lockSha256: "c".repeat(64),
    manifest: { devDependencies: { "@changesets/cli": "3.0.3" } },
    now: "2026-11-18T00:00:00.000Z",
    registry: {
      picomatch: {
        name: "picomatch",
        versions: Object.fromEntries(
          ["4.0.5", "4.0.7"].map((version) => [version, { version }]),
        ),
      },
    },
  };
  const approvals = [
    ["4.0.7", ".>@changesets/cli>@changesets/config>picomatch"],
    ["4.0.5", ".>@changesets/cli>@changesets/git>picomatch"],
  ].map(([version, path]) => ({
    advisory: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    version,
    path,
    severity: "high",
    scope: "development-only",
    vulnerableRange: "<=4.0.7",
    patchedRange: "<0.0.0",
    sourceSha: context.sourceSha,
    manifestSha256: context.manifestSha256,
    lockSha256: context.lockSha256,
    approvedAt: "2026-11-18T00:00:00.000Z",
    expiresAt: "2026-11-19T00:00:00.000Z",
    authority: "explicit-user",
    record: "spec/records/exact-user-decision.md",
  }));
  const clean = () => ({
    advisories: {},
    muted: [],
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    },
  });
  const full = clean();
  full.metadata.vulnerabilities.high = 2;
  full.advisories.one = {
    github_advisory_id: approvals[0].advisory,
    module_name: "picomatch",
    severity: "high",
    vulnerable_versions: "<=4.0.7",
    patched_versions: "<0.0.0",
    url: "https://github.com/advisories/" + approvals[0].advisory,
    findings: approvals.map(({ version, path }) => ({
      version,
      paths: [path],
    })),
  };
  return {
    full,
    production: clean(),
    policy: {
      schemaVersion: 2,
      repository: context.repository,
      approvals,
    },
    context,
  };
}

test("two exact HIGH versions within one raw advisory require independent explicit decisions", () => {
  const data = fixture(),
    result = evaluateDevelopmentAudit(data);
  assert.equal(result.allowed, true);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.rawVulnerabilities.high, 2);
  assert.equal(result.productionVulnerabilities.high, 0);
  assert.deepEqual(
    result.accepted.map((x) => x.version),
    ["4.0.7", "4.0.5"],
  );
});

test("schema1, absent/duplicate/extra approvals, delegated HIGH and excessive duration fail closed", () => {
  for (const change of [
    (d) => (d.policy.schemaVersion = 1),
    (d) => (d.policy.approvals = []),
    (d) => d.policy.approvals.pop(),
    (d) => d.policy.approvals.push(structuredClone(d.policy.approvals[0])),
    (d) => (d.policy.approvals[0].authority = "delegated-operator"),
    (d) => (d.policy.approvals[0].expiresAt = "2026-11-20T00:00:00.001Z"),
    (d) => (d.policy.approvals[0].sourceSha = "d".repeat(40)),
    (d) => (d.policy.approvals[0].manifestSha256 = "d".repeat(64)),
    (d) => (d.policy.approvals[0].lockSha256 = "d".repeat(64)),
    (d) => (d.policy.approvals[0].severity = "critical"),
    (d) => (d.policy.approvals[0].severity = "moderate"),
    (d) => (d.policy.approvals[0].vulnerableRange = ">=2 <5"),
    (d) => (d.policy.approvals[0].version = "4.0.8"),
  ]) {
    const data = fixture();
    change(data);
    assert.equal(
      evaluateDevelopmentAudit(data).allowed,
      false,
      change.toString(),
    );
  }
});

test("unmatched paths, changed raw count, production, suppression, range and known-fix changes block", () => {
  for (const change of [
    (d) =>
      d.full.advisories.one.findings[0].paths.push(
        ".>@changesets/cli>picomatch",
      ),
    (d) => (d.full.metadata.vulnerabilities.high = 1),
    (d) => (d.production = structuredClone(d.full)),
    (d) => d.full.muted.push("GHSA-fc5q-39xc-vjpf"),
    (d) => (d.full.advisories.one.patched_versions = ">=4.0.8"),
    (d) => (d.full.advisories.one.vulnerable_versions = "<=4.0.8"),
    (d) => delete d.context.registry.picomatch.versions["4.0.7"],
    (d) =>
      (d.context.registry.picomatch.versions["4.0.8"] = { version: "4.0.8" }),
    (d) => (d.context.now = "2026-11-19T00:00:00.000Z"),
  ]) {
    const data = fixture();
    change(data);
    assert.equal(
      evaluateDevelopmentAudit(data).allowed,
      false,
      change.toString(),
    );
  }
});

test("older approved versions do not mistake a known affected published ceiling for a fix", () => {
  const data = fixture();
  data.context.registry.picomatch.versions["4.0.6"] = { version: "4.0.6" };
  assert.equal(evaluateDevelopmentAudit(data).allowed, true);
  data.context.registry.picomatch.versions["5.0.0"] = { version: "5.0.0" };
  assert.equal(evaluateDevelopmentAudit(data).allowed, false);
});

test("partial HIGH evidence and overbroad approval lists reject, exact48h remains bounded", () => {
  const partial = fixture();
  partial.full.advisories.one.findings.pop();
  partial.full.metadata.vulnerabilities.high = 1;
  assert.equal(evaluateDevelopmentAudit(partial).allowed, false);
  const broad = fixture();
  for (let i = 0; i < 3; i++)
    broad.policy.approvals.push({
      ...broad.policy.approvals[0],
      path: `.>@changesets/cli>path${i}>picomatch`,
    });
  assert.equal(evaluateDevelopmentAudit(broad).allowed, false);
  const exact = fixture();
  exact.policy.approvals.forEach(
    (entry) => (entry.expiresAt = "2026-11-20T00:00:00.000Z"),
  );
  assert.equal(evaluateDevelopmentAudit(exact).allowed, true);
});

test("schema2 retains one independently bound LOW beside exact HIGH paths without widening LOW", () => {
  const data = fixture();
  const low = {
    ...data.policy.approvals[0],
    advisory: "GHSA-gcqx-w48m-w2h4",
    package: "deepmerge",
    version: "4.3.1",
    severity: "low",
    path: ".>@sveltejs/vite-plugin-svelte>deepmerge",
    vulnerableRange: ">=4.2.0 <=4.3.1",
    authority: "delegated-operator",
  };
  data.policy.approvals.push(low);
  data.context.manifest.devDependencies["@sveltejs/vite-plugin-svelte"] =
    "5.1.1";
  data.context.registry.deepmerge = {
    name: "deepmerge",
    versions: { "4.3.1": { version: "4.3.1" } },
  };
  data.full.advisories.low = {
    github_advisory_id: low.advisory,
    module_name: low.package,
    severity: "low",
    vulnerable_versions: low.vulnerableRange,
    patched_versions: "<0.0.0",
    url: "https://github.com/advisories/" + low.advisory,
    findings: [{ version: low.version, paths: [low.path] }],
  };
  data.full.metadata.vulnerabilities.low = 1;
  assert.equal(evaluateDevelopmentAudit(data).allowed, true);
  data.context.registry.deepmerge.versions["4.3.2"] = { version: "4.3.2" };
  assert.equal(evaluateDevelopmentAudit(data).allowed, false);
  delete data.context.registry.deepmerge.versions["4.3.2"];
  data.policy.approvals.push({ ...low, path: ".>other>deepmerge" });
  assert.equal(evaluateDevelopmentAudit(data).allowed, false);
});
