import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

const names = [
  ".editorconfig",
  ".prettierignore",
  ".prettierrc",
  ...[
    "json",
    "json5",
    "yaml",
    "yml",
    "toml",
    "js",
    "cjs",
    "mjs",
    "ts",
    "cts",
    "mts",
  ].map((extension) => `.prettierrc.${extension}`),
  ...["js", "cjs", "mjs", "ts", "cts", "mts"].map(
    (extension) => `prettier.config.${extension}`,
  ),
];

/** Opt-in absence is an input binding, never a formatter substitution. */
export async function assertFormatterPolicy(root, policy) {
  if (policy === undefined) return;
  if (policy !== "unconfigured")
    throw Error("Unsupported source formatter policy");
  for (
    let directory = path.resolve(root);
    ;
    directory = path.dirname(directory)
  ) {
    for (const file of names) {
      try {
        await lstat(path.join(directory, file));
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      throw Error(
        "Unconfigured formatter inputs changed; requalify in owning source",
      );
    }
    try {
      const manifest = JSON.parse(
        await readFile(path.join(directory, "package.json"), "utf8"),
      );
      if (Object.hasOwn(manifest, "prettier"))
        throw Error(
          "Unconfigured formatter manifest changed; requalify in owning source",
        );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (path.dirname(directory) === directory) return;
  }
}
