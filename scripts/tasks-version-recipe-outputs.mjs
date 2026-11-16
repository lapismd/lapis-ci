// Retain the existing Tasks entry points while sharing the reviewed plugin output checks.
export {
  validatePluginRecipeCase as validateTasksRecipeCase,
  assertPluginRecipePlan as assertTasksRecipePlan,
  snapshotPluginRecipe as snapshotTasksRecipe,
  verifyPluginRecipeOutputs as verifyTasksRecipeOutputs,
} from "./plugin-version-recipe-outputs.mjs";
