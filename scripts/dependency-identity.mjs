import { createHash } from "node:crypto";
import {
  appendFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const required = [
  "Dockerfile",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Hash the actual dependency-only Docker context, rather than predicting which
// lockfile changes might affect it. Source repositories own context assembly.
export async function dependencyIdentity({ root, baseImage }) {
  if (
    !/^ghcr\.io\/lapismd\/lapis-ci@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")
  )
    throw Error("Dependency toolchain must use an immutable Lapis CI digest");
  const files = {};
  const directories = {};
  let bytes = 0;
  let entries = 0;
  async function walk(directory = "") {
    for (const entry of (await readdir(path.join(root, directory))).sort()) {
      const name = directory ? `${directory}/${entry}` : entry;
      if (++entries > 10000 || name.split("/").length > 32)
        throw Error("Dependency context exceeds bounded input limits");
      const info = await lstat(path.join(root, name));
      if (info.isSymbolicLink())
        throw Error(`Dependency context contains a symbolic link: ${name}`);
      const forbidden = name
        .split("/")
        .some(
          (part) =>
            part.startsWith(".") ||
            ["node_modules", "dist", "build"].includes(part),
        );
      if (info.isDirectory()) {
        if (forbidden || !/^(?:packages|patches)(?:\/[\w@.+-]+)*$/.test(name))
          throw Error(`Unexpected dependency-context directory: ${name}`);
        directories[name] = info.mode & 0o777;
        await walk(name);
        continue;
      }
      const allowed =
        required.includes(name) ||
        name === "context.json" ||
        name === "patches/README.md" ||
        /^packages\/(?:[\w@.-]+\/)*package\.json$/.test(name) ||
        /^patches\/[\w./@+-]+\.patch$/.test(name);
      if (!info.isFile() || forbidden || !allowed)
        throw Error(`Unexpected dependency-context file: ${name}`);
      bytes += info.size;
      if (bytes > 268435456 || Object.keys(files).length >= 10000)
        throw Error("Dependency context exceeds bounded input limits");
      files[name] = {
        sha256: digest(await readFile(path.join(root, name))),
        mode: info.mode & 0o777,
      };
    }
  }
  await walk();
  for (const file of required)
    if (!Object.hasOwn(files, file))
      throw Error(`Missing required dependency-context file: ${file}`);
  if (
    !(await readFile(path.join(root, "Dockerfile"), "utf8")).includes(baseImage)
  )
    throw Error("Dockerfile does not bind the declared toolchain digest");
  const inputs = {
    schemaVersion: 1,
    baseImage,
    platforms: ["linux/amd64", "linux/arm64"],
    directories,
    files,
  };
  const identity = `sha256:${digest(JSON.stringify(inputs))}`;
  return { ...inputs, identity, tag: `deps-${identity.slice(7)}` };
}

async function main() {
  const { values } = parseArgs({
    options: {
      context: { type: "string" },
      "base-image": { type: "string" },
      receipt: { type: "string" },
      "github-output": { type: "string" },
    },
  });
  const context = path.resolve(values.context ?? ".ci/dependency-context");
  const receipt = path.resolve(
    values.receipt ?? ".ci/dependency-image-receipt.json",
  );
  const relative = path.relative(context, receipt);
  if (!relative.startsWith(`..${path.sep}`) || /[\r\n]/.test(receipt))
    throw Error("Receipt must be outside the hashed build context");
  const result = await dependencyIdentity({
    root: context,
    baseImage: values["base-image"],
  });
  const metadata = {
    ...result,
    repository: process.env.GITHUB_REPOSITORY ?? null,
    sourceSha: process.env.GITHUB_SHA ?? null,
    workflowRef: process.env.GITHUB_WORKFLOW_REF ?? null,
  };
  await mkdir(path.dirname(receipt), { recursive: true });
  await writeFile(receipt, `${JSON.stringify(metadata, null, 2)}\n`);
  if (values["github-output"])
    await appendFile(
      values["github-output"],
      `identity=${result.identity}\ntag=${result.tag}\nreceipt=${receipt}\n`,
    );
  console.log(
    JSON.stringify({
      identity: result.identity,
      tag: result.tag,
      files: Object.keys(result.files).length,
    }),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
