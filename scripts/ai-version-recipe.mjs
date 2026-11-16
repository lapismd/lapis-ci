import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  nativeRecipeEnvironment,
  verifyNativeRecipeTools,
} from "./native-version-recipe.mjs";

export const AI_RECIPE_PROFILE = "ai-node22-rust-offline";
const digest = (value) => /^[a-f0-9]{64}$/.test(value ?? "");

export function validateAiRecipeProfile(example) {
  if (example.profile === undefined) {
    assert.notEqual(
      example.repository,
      "lapismd/lapis-ai",
      "AI needs its native profile",
    );
    assert.equal(example.qualification?.nodeMajor ?? 24, 24);
    return null;
  }
  const tools = example.nativeTools;
  assert(
    example.profile === AI_RECIPE_PROFILE &&
      example.repository === "lapismd/lapis-ai" &&
      example.qualification.nodeMajor === 22 &&
      example.qualification.cliVersion === "2.31.1" &&
      example.qualification.packageManager === "pnpm@10.34.5" &&
      example.qualification.scripts["release:version"] ===
        "node scripts/changeset-version.mjs" &&
      example.ignorePnpmfile === true &&
      tools?.rustVersion === "1.99.0" &&
      /^22\.\d+\.\d+$/.test(tools.nodeVersion ?? "") &&
      tools.host === "x86_64-unknown-linux-gnu" &&
      tools.minimumFreeGiB === 30 &&
      tools.cargoPackages === 15 &&
      ["node", "cargo", "rustc"].every((name) =>
        digest(tools.binaries?.[name]),
      ),
    "AI qualification needs the reviewed Node22/Rust offline profile",
  );
  return tools;
}

export function aiRecipeEnvironment(base) {
  return {
    ...nativeRecipeEnvironment(base),
    LAPIS_AI_VALIDATION_RUNTIME: "native",
    CARGO_BUILD_JOBS: "1",
  };
}

export async function verifyAiRecipeTools(root, example, env, options = {}) {
  const tools = validateAiRecipeProfile(example);
  assert(tools, "An explicit AI profile is required");
  return verifyNativeRecipeTools(
    root,
    tools,
    example.qualification.packageManager,
    env,
    options,
  );
}

/** The unchanged source workflow bootstrap; the real recipe remains offline. */
export function bootstrapAiRecipe(root, env, execute = execFileSync) {
  assert.equal(env.LAPIS_AI_VALIDATION_RUNTIME, "native");
  const commands = [
    ["release:check"],
    ["dev:cargo", "--", "fetch", "--locked"],
  ];
  for (const args of commands)
    execute("pnpm", args, { cwd: root, env, stdio: "inherit" });
  return commands;
}
