import { execFileSync } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dependencyIdentity } from "./dependency-identity.mjs";

export const PREDICATE_TYPE =
  "https://lapis.md/attestations/dependency-image/v1";
export class CacheUnavailableError extends Error {}
const networkFailure = (error) =>
  error.code === "ETIMEDOUT" ||
  /TLS handshake timeout|dial tcp|context deadline exceeded|connection refused|no such host|network is unreachable|(?:HTTP|status(?: code)?)[: ]+(?:429|500|502|503|504)\b/i.test(
    String(error.stderr ?? ""),
  );
const sha256 = /^sha256:[a-f0-9]{64}$/;
const options = {
  encoding: "utf8",
  timeout: 120000,
  maxBuffer: 16777216,
  stdio: ["ignore", "pipe", "pipe"],
};
const inputs = (receipt) =>
  Object.fromEntries(
    [
      "schemaVersion",
      "baseImage",
      "builder",
      "platforms",
      "directories",
      "files",
      "identity",
      "tag",
    ].map((key) => [key, receipt[key]]),
  );

export function lookupImage(tag, run = execFileSync) {
  let result;
  try {
    result = run(
      "docker",
      [
        "buildx",
        "imagetools",
        "inspect",
        tag,
        "--format",
        "{{json .Manifest}}",
      ],
      options,
    );
  } catch (error) {
    const message = String(error.stderr ?? "");
    if (/manifest.?unknown|not found|404/i.test(message))
      return { state: "miss" };
    if (
      error.code === "ETIMEDOUT" ||
      /timeout|timed out|connection refused|no such host|network is unreachable|TLS handshake|unauthorized|denied|\b(?:401|403|429|500|502|503|504)\b/i.test(
        message,
      )
    )
      return { state: "unavailable" };
    throw Error(
      "Dependency-image lookup failed unexpectedly; fix the lookup rather than accepting an unverified image",
    );
  }
  return { state: "found", descriptor: JSON.parse(result) };
}

export function verifyImage(
  reference,
  { repository, workflow },
  run = execFileSync,
) {
  const identity = `https://github.com/${repository}/${workflow}@refs/heads/main`;
  let result;
  try {
    result = run(
      "gh",
      [
        "attestation",
        "verify",
        `oci://${reference}`,
        "--repo",
        repository,
        "--cert-identity",
        identity,
        "--source-ref",
        "refs/heads/main",
        "--deny-self-hosted-runners",
        "--predicate-type",
        PREDICATE_TYPE,
        "--format",
        "json",
      ],
      options,
    );
  } catch (error) {
    if (networkFailure(error))
      throw new CacheUnavailableError("Attestation service is unavailable");
    throw Error(
      "Dependency-image attestation verification failed; unverified images are forbidden",
    );
  }
  return JSON.parse(result);
}

export async function resolveDependencyImage({
  expected,
  image,
  repository,
  workflow = ".github/workflows/dependency-image.yml",
  lookup = lookupImage,
  verify = verifyImage,
}) {
  if (
    !/^lapismd\/[a-z0-9-]+$/.test(repository ?? "") ||
    !/^ghcr\.io\/lapismd\/[a-z0-9-]+$/.test(image ?? "") ||
    !/^\.github\/workflows\/[a-z0-9-]+\.ya?ml$/.test(workflow)
  )
    throw Error("Unreviewed image producer scope");
  if (
    expected.schemaVersion !== 1 ||
    !/^v\d+\.\d+\.\d+$/.test(expected.builder?.buildx ?? "") ||
    !/^moby\/buildkit:v\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/.test(
      expected.builder?.buildkit ?? "",
    ) ||
    !sha256.test(expected.identity) ||
    expected.tag !== `deps-${expected.identity.slice(7)}` ||
    !/^ghcr\.io\/lapismd\/lapis-ci@sha256:[a-f0-9]{64}$/.test(
      expected.baseImage,
    ) ||
    !isDeepStrictEqual(expected.platforms, ["linux/amd64", "linux/arm64"])
  )
    throw Error("Invalid current input identity");
  const located = await lookup(`${image}:${expected.tag}`);
  if (["miss", "unavailable"].includes(located.state))
    return {
      state: located.state,
      reference: expected.baseImage,
      identity: expected.identity,
    };
  const descriptor = located.descriptor;
  if (
    located.state !== "found" ||
    descriptor?.schemaVersion !== 2 ||
    !sha256.test(descriptor.digest) ||
    ![
      "application/vnd.oci.image.index.v1+json",
      "application/vnd.docker.distribution.manifest.list.v2+json",
    ].includes(descriptor.mediaType) ||
    !Array.isArray(descriptor.manifests)
  )
    throw Error("Invalid immutable dependency-image index");
  const platforms = descriptor.manifests
    .filter((entry) => entry.platform?.os !== "unknown")
    .map((entry) => {
      if (!sha256.test(entry.digest))
        throw Error("Invalid platform manifest digest");
      return `${entry.platform?.os}/${entry.platform?.architecture}`;
    })
    .sort();
  if (!isDeepStrictEqual(platforms, expected.platforms))
    throw Error(
      "Dependency image must provide exactly both reviewed platforms",
    );
  const reference = `${image}@${descriptor.digest}`;
  let proof;
  try {
    proof = await verify(reference, { repository, workflow });
  } catch (error) {
    if (error instanceof CacheUnavailableError)
      return {
        state: "unavailable",
        reference: expected.baseImage,
        identity: expected.identity,
      };
    throw error;
  }
  if (!Array.isArray(proof))
    throw Error("No verified dependency-image statements");
  const signer = `https://github.com/${repository}/${workflow}@refs/heads/main`;
  for (const record of proof) {
    const result = record.verificationResult,
      statement = result?.statement;
    const predicate = statement?.predicate,
      certificate = result?.signature?.certificate;
    // These field names are the CLI's Sigstore certificate summary, not values
    // supplied by the workflow predicate. Cryptographic verification runs first.
    if (
      statement?.predicateType !== PREDICATE_TYPE ||
      !predicate ||
      !certificate
    )
      continue;
    if (
      !statement.subject?.some(
        (subject) =>
          subject.name === image &&
          subject.digest?.sha256 === descriptor.digest.slice(7),
      )
    )
      continue;
    if (
      certificate.subjectAlternativeName !== signer ||
      certificate.buildSignerURI !== signer ||
      certificate.sourceRepositoryURI !== `https://github.com/${repository}` ||
      certificate.sourceRepositoryRef !== "refs/heads/main" ||
      certificate.runnerEnvironment !== "github-hosted"
    )
      continue;
    if (
      !/^[a-f0-9]{40}$/.test(predicate.sourceSha ?? "") ||
      predicate.sourceSha !== certificate.sourceRepositoryDigest ||
      predicate.sourceSha !== certificate.buildSignerDigest ||
      predicate.repository !== repository ||
      predicate.workflowRef !== `${repository}/${workflow}@refs/heads/main`
    )
      continue;
    if (!isDeepStrictEqual(inputs(predicate), inputs(expected))) continue;
    return {
      state: "hit",
      reference,
      identity: expected.identity,
      producerSha: predicate.sourceSha,
      workflowRef: predicate.workflowRef,
    };
  }
  throw Error(
    "Verified image does not bind the current inputs, platforms and trusted producer; refusing cache downgrade",
  );
}

async function main() {
  const { values } = parseArgs({
    options: Object.fromEntries(
      [
        "context",
        "base-image",
        "image",
        "repository",
        "workflow",
        "report",
        "github-output",
      ].map((name) => [name, { type: "string" }]),
    ),
  });
  const root = path.resolve(values.context ?? ".ci/dependency-context");
  const report = path.resolve(
    values.report ?? ".ci/dependency-image-resolution.json",
  );
  if (
    !path.relative(root, report).startsWith(`..${path.sep}`) ||
    /[\r\n]/.test(report)
  )
    throw Error("Resolution report must be outside the build context");
  const expected = await dependencyIdentity({
    root,
    baseImage: values["base-image"],
  });
  const result = await resolveDependencyImage({
    expected,
    image: values.image,
    repository: values.repository,
    workflow: values.workflow,
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
