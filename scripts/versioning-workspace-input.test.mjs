import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  developmentWorkspaceDigest,
  validateWorkspacePolicy,
} from "./versioning-workspace-input.mjs";

const dependency = "@lapismd/design-core";
const text =
  'packages: ["packages/*"]\noverrides:\n  "@lapismd/design-core": "0.13.4" # reviewed dev data\n  typescript: "5.9.3"\n';
const hash = (value) => createHash("sha256").update(value).digest("hex");
const policy = {
  schemaVersion: 1,
  sha256: hash(text.replace('"0.13.4"', '"<development-override>"')),
  developmentOverride: { dependency, series: "0.13", minimumPatch: 4 },
};
const manifest = { devDependencies: { [dependency]: "0.13.4" } };
const installed = { name: dependency, version: "0.13.4" };
const run = (bytes = text, p = policy, m = manifest, i = installed) =>
  developmentWorkspaceDigest(bytes, p, m, i);

test("only the exact selected version token is normalized, preserving comments and bytes", () => {
  assert.equal(run(), policy.sha256);
  assert.equal(run(Buffer.from(text)), policy.sha256);
  assert.equal(
    run(
      text.replace('"0.13.4"', '"0.13.5"'),
      policy,
      { devDependencies: { [dependency]: "0.13.5" } },
      { ...installed, version: "0.13.5" },
    ),
    policy.sha256,
  );
  for (const changed of [
    text.replace("5.9.3", "5.9.4"),
    text.replace("packages/*", "other/*"),
    text.replace("reviewed dev data", "changed comment"),
    text + "enableScripts: true\n",
    text.replace(
      "  typescript:",
      '  "@changesets/cli": "9.0.0"\n  typescript:',
    ),
  ])
    assert.notEqual(run(changed), policy.sha256);
});

for (const value of [
  "0.13.3",
  "0.14.0",
  "1.13.4",
  "0.13.5-next.0",
  "0.13.5+build",
  "^0.13.4",
  "catalog:",
  "013.4.5",
  "0.13.9007199254740993",
  "file:../core",
])
  test(`unreviewed development coordinates ${value} fail`, () => {
    assert.throws(
      () =>
        run(
          text.replace('"0.13.4"', JSON.stringify(value)),
          policy,
          { devDependencies: { [dependency]: value } },
          { ...installed, version: value },
        ),
      /stable exact|invalid version|patch scope/,
    );
  });

test("runtime, installed identity and manifest/override mismatches fail", () => {
  for (const m of [
    { ...manifest, dependencies: { [dependency]: "0.13.4" } },
    { ...manifest, optionalDependencies: { [dependency]: "0.13.4" } },
    { devDependencies: {} },
  ])
    assert.throws(
      () => run(text, policy, m),
      /development manifest|stable exact/,
    );
  assert.throws(
    () => run(text, policy, manifest, { ...installed, version: "0.13.5" }),
    /installed identity/,
  );
  assert.throws(
    () => run(text, policy, manifest, { ...installed, name: "@lapismd/other" }),
    /installed identity/,
  );
  assert.throws(
    () => run(text.replace('"0.13.4"', '"0.13.5"')),
    /mismatched development override/,
  );
});

test("missing, nested, duplicate and interpolated selectors fail", () => {
  for (const changed of [
    text.replace("overrides:", "catalog:"),
    text + "overrides:\n",
    text.replace(
      '  "@lapismd/design-core": "0.13.4"',
      '    "@lapismd/design-core": "0.13.4"',
    ),
    text.replace(
      "  typescript:",
      '  "@lapismd/design-core": "0.13.4"\n  typescript:',
    ),
    text.replace('"0.13.4"', '"${VERSION}"'),
    text.replace('"0.13.4"', "*version"),
  ])
    assert.throws(() => run(changed), /overrides|development override/);
});

test("source policy is exact and cannot authorize paths or third-party selectors", () => {
  for (const mutate of [
    (p) => {
      p.extra = true;
    },
    (p) => {
      p.schemaVersion = 2;
    },
    (p) => {
      p.sha256 = "invalid";
    },
    (p) => {
      p.developmentOverride.extra = true;
    },
    (p) => {
      p.developmentOverride.dependency = "../../etc";
    },
    (p) => {
      p.developmentOverride.dependency = "typescript";
    },
    (p) => {
      p.developmentOverride.series = "0.*";
    },
    (p) => {
      p.developmentOverride.dependency = "@lapismd/..";
    },
    (p) => {
      p.developmentOverride.dependency = "@lapismd/.";
    },
    (p) => {
      p.developmentOverride.minimumPatch = -1;
    },
    (p) => {
      p.developmentOverride.minimumPatch = "4";
    },
  ]) {
    const p = structuredClone(policy);
    mutate(p);
    assert.throws(
      () => validateWorkspacePolicy(p),
      /source policy|source selector/,
    );
  }
  assert.throws(() => run(Buffer.from([255])), /encoded data/);
  assert.throws(() => run(" ".repeat(262145)), /oversized/);
});

test("quoted, single-quoted and plain literal keys stay individually byte-bound", () => {
  for (const line of [
    '  "@lapismd/design-core": "0.13.4"',
    "  '@lapismd/design-core': '0.13.4'",
    "  @lapismd/design-core: 0.13.4",
  ]) {
    const bytes = "overrides:\n" + line + "\n";
    const p = {
      ...policy,
      sha256: hash(bytes.replace("0.13.4", "<development-override>")),
    };
    assert.equal(run(bytes, p), p.sha256);
  }
});
