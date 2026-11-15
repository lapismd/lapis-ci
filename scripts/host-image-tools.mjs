import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function hostImageTools(value) {
  if (
    value.schemaVersion !== 1 ||
    !/^\d+\.\d+\.\d+$/.test(value.buildx ?? "") ||
    !/^moby\/buildkit:v\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/.test(
      value.buildkit ?? "",
    )
  )
    throw Error(
      "Host image tools must use exact versions and immutable BuildKit bytes",
    );
  return { buildx: `v${value.buildx}`, buildkit: value.buildkit };
}
async function main() {
  const value = hostImageTools(
    JSON.parse(
      await readFile(new URL("../host-tools.json", import.meta.url), "utf8"),
    ),
  );
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `version=${value.buildx}\nbuildkit=${value.buildkit}\n`,
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
