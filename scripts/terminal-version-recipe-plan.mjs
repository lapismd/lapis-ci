import assert from "node:assert/strict";

const publicName = "@lapismd/terminal",
  demoName = "@lapismd/terminal-demo";
const sorted = (entries) =>
  [...entries].sort((a, b) => a.name.localeCompare(b.name));

export function validateTerminalPlanBinding(example) {
  const expected = example.expectedPlan;
  assert.equal(example.profile, "terminal-node24-rust-offline");
  assert(
    Array.isArray(expected) && expected.length === 2,
    "Terminal needs its exact reviewed CLI plan",
  );
  const publicRelease = expected.find((item) => item.name === publicName),
    demo = expected.find((item) => item.name === demoName);
  assert(publicRelease && demo);
  for (const entry of expected)
    assert.equal(
      Object.keys(entry).sort().join(),
      "name,newVersion,oldVersion,type",
    );
  assert.match(
    publicRelease.oldVersion,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  );
  const next = publicRelease.oldVersion.split(".").map(Number);
  next[2] += 1;
  assert.equal(publicRelease.type, "patch");
  assert.equal(publicRelease.newVersion, next.join("."));
  assert.equal(demo.type, "none");
  assert.equal(demo.oldVersion, publicRelease.oldVersion);
  assert.equal(demo.newVersion, publicRelease.oldVersion);
  return { publicRelease, demo };
}

export function assertTerminalRecipePlan(example, plan) {
  validateTerminalPlanBinding(example);
  assert(Array.isArray(plan));
  assert.deepEqual(
    sorted(
      plan.map(({ name, type, oldVersion, newVersion }) => ({
        name,
        type,
        oldVersion,
        newVersion,
      })),
    ),
    sorted(example.expectedPlan),
    "Actual Terminal CLI plan differs from reviewed public patch/private none plan",
  );
}

/** Preserve the CLI plan; separately model the unchanged wrapper's demo sync. */
export function terminalPreparedVersions(example, changes) {
  const { publicRelease } = validateTerminalPlanBinding(example);
  const project = (entries) =>
    sorted(
      entries.map(({ name, oldVersion, newVersion }) => ({
        name,
        oldVersion,
        newVersion,
      })),
    );
  assert.deepEqual(
    project(changes),
    project(example.expectedPlan),
    "Terminal input versions differ from reviewed CLI plan",
  );
  return changes.map((entry) => ({
    ...entry,
    newVersion: publicRelease.newVersion,
  }));
}
