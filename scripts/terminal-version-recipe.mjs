import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  nativeRecipeEnvironment,
  verifyNativeRecipeTools,
} from "./native-version-recipe.mjs";

import { validateTerminalPlanBinding } from "./terminal-version-recipe-plan.mjs";

export const TERMINAL_RECIPE_PROFILE = "terminal-node24-rust-offline";

export function validateTerminalRecipeProfile(example) {
  if (example.profile !== TERMINAL_RECIPE_PROFILE) {
    assert.notEqual(
      example.repository,
      "lapismd/lapis-terminal",
      "Terminal needs its native profile",
    );
    return null;
  }
  const tools = example.nativeTools;
  assert(
    example.repository === "lapismd/lapis-terminal" &&
      example.qualification.nodeMajor === 24 &&
      example.qualification.cliVersion === "2.31.1" &&
      example.qualification.packageManager === "pnpm@10.32.1" &&
      example.qualification.scripts["release:version"] ===
        "node scripts/changeset-version.mjs" &&
      example.qualification.scripts["release:check"] ===
        "node scripts/release-state.mjs" &&
      example.qualification.scripts["dev:cargo"] ===
        "node scripts/managed-cargo.mjs" &&
      example.ignorePnpmfile === true &&
      tools?.nodeVersion === "24.15.0" &&
      tools.rustVersion === "1.99.0" &&
      tools.host === "x86_64-unknown-linux-gnu" &&
      tools.minimumFreeGiB === 20 &&
      tools.cargoPackages === 4 &&
      tools.cpuCount === 4 &&
      ["node", "cargo", "rustc"].every((name) =>
        /^[a-f0-9]{64}$/.test(tools.binaries?.[name] ?? ""),
      ),
    "Terminal qualification needs the reviewed Node24/Rust offline profile",
  );
  validateTerminalPlanBinding(example);
  return tools;
}

export function terminalRecipeEnvironment(base) {
  return { ...nativeRecipeEnvironment(base), CARGO_BUILD_JOBS: "4" };
}

export async function verifyTerminalRecipeTools(
  root,
  example,
  env,
  options = {},
) {
  const tools = validateTerminalRecipeProfile(example);
  assert(tools, "An explicit Terminal profile is required");
  return verifyNativeRecipeTools(
    root,
    tools,
    example.qualification.packageManager,
    env,
    options,
  );
}

export function bootstrapTerminalRecipe(root, env, execute = execFileSync) {
  assert.equal(env.CARGO_BUILD_JOBS, "4");
  const commands = [
    ["release:check"],
    ["dev:cargo", "--", "fetch", "--locked"],
  ];
  for (const args of commands)
    execute("pnpm", args, { cwd: root, env, stdio: "inherit" });
  return commands;
}
