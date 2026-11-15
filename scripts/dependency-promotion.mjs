import { execFileSync } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dependencyIdentity } from "./dependency-identity.mjs";
import { lookupImage, resolveDependencyImage } from "./dependency-resolver.mjs";

export async function promoteDependencyImage({
  expected,
  image,
  repository,
  workflow = ".github/workflows/dependency-image.yml",
  digest,
  sourceRef,
  resolve = resolveDependencyImage,
  lookup = lookupImage,
  run = execFileSync,
}) {
  if (sourceRef !== "refs/heads/main")
    throw Error("Dependency-image publication is restricted to trusted main");
  if (
    !/^lapismd\/[a-z0-9-]+$/.test(repository ?? "") ||
    !/^ghcr\.io\/lapismd\/[a-z0-9-]+$/.test(image ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(digest ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(expected.identity ?? "") ||
    expected.tag !== `deps-${expected.identity.slice(7)}`
  )
    throw Error("Unreviewed image publication coordinates");
  const policy = { expected, image, repository, workflow };
  const current = await resolve(policy);
  if (current.state === "hit") return { ...current, state: "reused" };
  if (current.state !== "miss")
    throw Error(
      "Cannot confirm identity tag absence while the registry or verifier is unavailable",
    );
  const reference = `${image}@${digest}`;
  const staged = await resolve({ ...policy, lookup: () => lookup(reference) });
  if (staged.state !== "hit" || staged.reference !== reference)
    throw Error("Staging digest has not been verified for the current inputs");
  const latest = await resolve(policy);
  if (latest.state === "hit") return { ...latest, state: "reused" };
  if (latest.state !== "miss")
    throw Error("Cannot confirm identity tag absence before promotion");
  try {
    await run(
      "docker",
      [
        "buildx",
        "imagetools",
        "create",
        "--tag",
        `${image}:${expected.tag}`,
        reference,
      ],
      {
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 16777216,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    throw Error(
      "Registry publication outcome is uncertain; inspect the identity tag before retrying",
    );
  }
  const accepted = await resolve(policy);
  if (accepted.state !== "hit" || accepted.reference !== reference)
    throw Error(
      "Published index bytes differ or read-back is uncertain; inspect before retrying",
    );
  return { ...accepted, state: "published" };
}

async function main() {
  if (process.env.GITHUB_REF !== "refs/heads/main")
    throw Error("Dependency-image publication requires trusted main");
  const { values } = parseArgs({
    options: Object.fromEntries(
      [
        "context",
        "base-image",
        "image",
        "digest",
        "workflow",
        "report",
        "github-output",
      ].map((name) => [name, { type: "string" }]),
    ),
  });
  const root = path.resolve(values.context ?? ".ci/dependency-context");
  const report = path.resolve(
    values.report ?? ".ci/dependency-image-publication.json",
  );
  if (
    !path.relative(root, report).startsWith(`..${path.sep}`) ||
    /[\r\n]/.test(report)
  )
    throw Error("Publication receipt must be outside the build context");
  const expected = await dependencyIdentity({
    root,
    baseImage: values["base-image"],
  });
  const result = await promoteDependencyImage({
    expected,
    image: values.image,
    repository: process.env.GITHUB_REPOSITORY,
    workflow: values.workflow,
    digest: values.digest,
    sourceRef: process.env.GITHUB_REF,
  });
  await mkdir(path.dirname(report), { recursive: true });
  await writeFile(report, `${JSON.stringify(result, null, 2)}\n`);
  if (values["github-output"])
    await appendFile(
      values["github-output"],
      `state=${result.state}\nreference=${result.reference}\nidentity=${result.identity}\n`,
    );
  console.log(JSON.stringify(result));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
