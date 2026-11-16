import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDevelopmentAudit } from "./development-audit.mjs";

const context = {
  repository: "lapismd/example",
  sourceSha: "a".repeat(40),
  manifestSha256: "b".repeat(64),
  lockSha256: "c".repeat(64),
  manifest: { devDependencies: { "@sveltejs/vite-plugin-svelte": "5.1.1" } },
  now: "2026-11-16T04:00:00.000Z",
  registry: {
    deepmerge: {
      name: "deepmerge",
      versions: { "4.3.1": { version: "4.3.1" } },
    },
  },
};
const approval = {
  advisory: "GHSA-gcqx-w48m-w2h4",
  package: "deepmerge",
  version: "4.3.1",
  severity: "low",
  path: ".>@sveltejs/vite-plugin-svelte>deepmerge",
  scope: "development-only",
  vulnerableRange: ">=4.2.0 <=4.3.1",
  patchedRange: "<0.0.0",
  sourceSha: context.sourceSha,
  manifestSha256: context.manifestSha256,
  lockSha256: context.lockSha256,
  approvedAt: "2026-11-16T03:00:00.000Z",
  expiresAt: "2026-11-21T00:00:00.000Z",
  authority: "delegated-operator",
  record: "spec/records/operator-decision.md",
};
const policy = {
  schemaVersion: 1,
  repository: context.repository,
  approvals: [approval],
};
const clean = () => ({
  advisories: {},
  muted: [],
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
  },
});
const full = () => ({
  ...clean(),
  advisories: {
    one: {
      github_advisory_id: approval.advisory,
      module_name: approval.package,
      severity: "low",
      vulnerable_versions: approval.vulnerableRange,
      patched_versions: "<0.0.0",
      url: "https://github.com/advisories/" + approval.advisory,
      findings: [{ version: "4.3.1", paths: [approval.path] }],
    },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0 },
  },
});
const evaluate = (overrides = {}) =>
  evaluateDevelopmentAudit({
    full: full(),
    production: clean(),
    policy,
    context,
    ...overrides,
  });

test("exact delegated development LOW requires clean production and all source bindings", () => {
  const result = evaluate();
  assert.equal(result.allowed, true);
  assert.equal(result.status, "temporary-development-acceptance");
  assert.equal(result.rawVulnerabilities.low, 1);
  assert.equal(result.accepted.length, 1);
});

test("changed identity, path, severity or source/manifest/lock never inherits acceptance", () => {
  for (const field of [
    "sourceSha",
    "manifestSha256",
    "lockSha256",
    "repository",
  ])
    assert.equal(
      evaluate({
        context: {
          ...context,
          [field]: "d".repeat(field === "sourceSha" ? 40 : 64),
        },
      }).allowed,
      false,
      field,
    );
  for (const mutate of [
    (a) => (a.advisories.one.findings[0].paths = [".>other>deepmerge"]),
    (a) => (a.advisories.one.findings[0].version = "4.3.0"),
    (a) => {
      a.advisories.one.severity = "high";
      a.metadata.vulnerabilities = {
        ...a.metadata.vulnerabilities,
        low: 0,
        high: 1,
      };
    },
    (a) => (a.advisories.one.github_advisory_id = "GHSA-aaaa-bbbb-cccc"),
  ]) {
    const audit = full();
    mutate(audit);
    assert.equal(evaluate({ full: audit }).allowed, false);
  }
});

test("expiry, future approval, published successors and changed fix metadata hold", () => {
  for (const now of [approval.expiresAt, "2026-11-16T02:59:59.000Z"])
    assert.equal(evaluate({ context: { ...context, now } }).allowed, false);
  const registry = {
    deepmerge: {
      name: "deepmerge",
      versions: {
        ...context.registry.deepmerge.versions,
        "4.3.2": { version: "4.3.2" },
      },
    },
  };
  assert.equal(evaluate({ context: { ...context, registry } }).allowed, false);
  const fixed = full();
  fixed.advisories.one.patched_versions = ">=4.3.2";
  assert.equal(evaluate({ full: fixed }).allowed, false);
  assert.equal(
    evaluate({ context: { ...context, registry: {} } }).allowed,
    false,
  );
});

test("production exposure, extra findings, muted or incomplete evidence remain blocking", () => {
  assert.equal(evaluate({ production: full() }).allowed, false);
  assert.equal(
    evaluate({
      context: {
        ...context,
        manifest: { ...context.manifest, dependencies: { deepmerge: "4.3.1" } },
      },
    }).allowed,
    false,
  );
  assert.equal(
    evaluate({
      context: {
        ...context,
        manifest: { dependencies: { "@sveltejs/vite-plugin-svelte": "5.1.1" } },
      },
    }).allowed,
    false,
  );
  const extra = full();
  extra.advisories.two = {
    ...extra.advisories.one,
    github_advisory_id: "GHSA-aaaa-bbbb-cccc",
    url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  };
  extra.metadata.vulnerabilities.low = 2;
  assert.equal(evaluate({ full: extra }).allowed, false);
  for (const broken of [
    { ...full(), muted: ["hidden"] },
    { ...full(), advisories: {} },
    { ...full(), error: { code: "network" } },
    { ...full(), metadata: {} },
  ])
    assert.equal(evaluate({ full: broken }).allowed, false);
});

test("clean source retires a stale approval instead of applying its authority", () => {
  const result = evaluate({
    full: clean(),
    context: {
      ...context,
      now: "2026-11-22T00:00:00.000Z",
      lockSha256: "d".repeat(64),
    },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.status, "clean");
  assert.deepEqual(result.accepted, []);
  assert.equal(result.retired.length, 1);
  assert.equal(
    evaluate({
      full: clean(),
      context: { ...context, repository: "lapismd/other" },
    }).allowed,
    false,
  );
});

test("approval schema rejects broad duration, severity, scope and undocumented keys", () => {
  for (const changed of [
    { expiresAt: "2026-11-24T00:00:00.000Z" },
    { severity: "moderate" },
    { scope: "runtime" },
    { enabled: true },
    { authority: "assumed-user-approval" },
    { record: "../private.md" },
  ])
    assert.equal(
      evaluate({
        policy: { ...policy, approvals: [{ ...approval, ...changed }] },
      }).allowed,
      false,
    );
});
