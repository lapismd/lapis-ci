import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertTerminalRecipePlan,
  terminalPreparedVersions,
} from "./terminal-version-recipe-plan.mjs";

const example = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
).cases["terminal-changesets2-native"];
const plan = [
  {
    name: "@lapismd/terminal",
    type: "patch",
    oldVersion: "0.1.2",
    newVersion: "0.1.3",
    changesets: ["ordered-terminal-output"],
  },
  {
    name: "@lapismd/terminal-demo",
    type: "none",
    oldVersion: "0.1.2",
    newVersion: "0.1.2",
    changesets: [],
  },
];
test("the actual Terminal CLI private none entry remains distinct from source-owned demo synchronization", () => {
  assertTerminalRecipePlan(example, plan);
  const changes = plan.map(({ type, changesets, ...item }) => ({
    ...item,
    changelogBefore: "retained input hash",
  }));
  const prepared = terminalPreparedVersions(example, changes);
  assert.equal(
    changes[1].newVersion,
    "0.1.2",
    "Do not rewrite the CLI receipt",
  );
  assert.equal(
    prepared[1].newVersion,
    "0.1.3",
    "The wrapper must coordinate the private demo",
  );
  assert.equal(prepared[1].changelogBefore, "retained input hash");
});

test("missing, extra, renamed, non-patch and private-version plans reject instead of loosening the gate", () => {
  for (const changed of [
    plan.slice(0, 1),
    [...plan, { ...plan[0], name: "@lapismd/unreviewed" }],
    [plan[0], { ...plan[1], name: "@lapismd/unreviewed" }],
    [{ ...plan[0], type: "minor" }, plan[1]],
    [{ ...plan[0], newVersion: "0.1.4" }, plan[1]],
    [plan[0], { ...plan[1], type: "patch", newVersion: "0.1.3" }],
    [plan[0], { ...plan[1], oldVersion: "0.1.1" }],
    [plan[0], plan[0]],
  ])
    assert.throws(() => assertTerminalRecipePlan(example, changed));
  assert.throws(() => terminalPreparedVersions(example, plan.slice(0, 1)));
});
