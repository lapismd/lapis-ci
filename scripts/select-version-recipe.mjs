import { appendFile, readFile } from "node:fs/promises";
import { selectRecipeCase } from "./version-recipe-layout.mjs";

const name = process.env.RECIPE_CASE;
if (!/^[a-z0-9-]+$/.test(name ?? ""))
  throw Error("Select a reviewed recipe ID");
const data = JSON.parse(
  await readFile(
    new URL("../version-recipe-cases.json", import.meta.url),
    "utf8",
  ),
);
const selected = selectRecipeCase(data, name);
if (!process.env.GITHUB_OUTPUT) throw Error("Hosted step output is required");
await appendFile(
  process.env.GITHUB_OUTPUT,
  `case=${name}\nrepository=${selected.repository}\nsource=${selected.sourceSha}\npnpm=${selected.qualification.packageManager}\nprofile=${selected.profile ?? "node24"}\nnode=${selected.nativeTools?.nodeVersion ?? "24.15.0"}\n`,
);
