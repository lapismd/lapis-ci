import { appendFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function prepareRegistryReadiness(environmentFile) {
  if (!environmentFile)
    throw Error("A hosted environment output file is required");
  const modulePath = await realpath(
    fileURLToPath(new URL("./registry-readiness.mjs", import.meta.url)),
  );
  if (/[\r\n]/.test(modulePath)) throw Error("Invalid helper source path");
  await appendFile(
    environmentFile,
    `LAPIS_REGISTRY_READINESS_MODULE=${modulePath}\n`,
  );
  return modulePath;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await prepareRegistryReadiness(process.env.GITHUB_ENV);
