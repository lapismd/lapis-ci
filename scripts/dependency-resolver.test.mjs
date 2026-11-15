import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveDependencyImage,
  lookupImage,
  verifyImage,
  PREDICATE_TYPE,
  CacheUnavailableError,
} from "./dependency-resolver.mjs";

const repository = "lapismd/lapis-plugins",
  image = "ghcr.io/lapismd/lapis-plugins-ci";
const workflow = ".github/workflows/dependency-image.yml";
const sha = "a".repeat(40),
  digest = `sha256:${"b".repeat(64)}`;
const expected = {
  schemaVersion: 1,
  baseImage: `ghcr.io/lapismd/lapis-ci@sha256:${"c".repeat(64)}`,
  builder: {
    buildx: "v0.38.1",
    buildkit: `moby/buildkit:v0.35.0@sha256:${"f".repeat(64)}`,
  },
  platforms: ["linux/amd64", "linux/arm64"],
  files: { Dockerfile: { sha256: "d".repeat(64), mode: 420 } },
  directories: {},
  identity: `sha256:${"e".repeat(64)}`,
  tag: `deps-${"e".repeat(64)}`,
};
function fixture() {
  const signer = `https://github.com/${repository}/${workflow}@refs/heads/main`;
  const proof = [
    {
      verificationResult: {
        signature: {
          certificate: {
            subjectAlternativeName: signer,
            buildSignerURI: signer,
            buildSignerDigest: sha,
            sourceRepositoryURI: `https://github.com/${repository}`,
            sourceRepositoryRef: "refs/heads/main",
            sourceRepositoryDigest: sha,
            runnerEnvironment: "github-hosted",
          },
        },
        statement: {
          predicateType: PREDICATE_TYPE,
          subject: [{ name: image, digest: { sha256: digest.slice(7) } }],
          predicate: {
            ...structuredClone(expected),
            repository,
            sourceSha: sha,
            workflowRef: `${repository}/${workflow}@refs/heads/main`,
          },
        },
      },
    },
  ];
  const descriptor = {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    digest,
    manifests: expected.platforms.map((platform) => {
      const [os, architecture] = platform.split("/");
      return { digest, platform: { os, architecture } };
    }),
  };
  return {
    expected,
    repository,
    workflow,
    image,
    proof,
    descriptor,
    lookup: async () => ({ state: "found", descriptor }),
    verify: async () => proof,
  };
}

test("resolver verifies the immutable index and signed inputs before returning an image", async () => {
  const f = fixture();
  f.lookup = async (tag) => {
    assert.equal(tag, `${image}:${expected.tag}`);
    return { state: "found", descriptor: f.descriptor };
  };
  f.verify = async (reference, policy) => {
    assert.equal(reference, `${image}@${digest}`);
    assert.deepEqual(policy, { repository, workflow });
    return f.proof;
  };
  assert.deepEqual(await resolveDependencyImage(f), {
    state: "hit",
    reference: `${image}@${digest}`,
    identity: expected.identity,
    producerSha: sha,
    workflowRef: `${repository}/${workflow}@refs/heads/main`,
  });
});

for (const state of ["miss", "unavailable"])
  test(`${state} uses the reviewed base image for a candidate frozen install`, async () => {
    const f = fixture();
    f.lookup = async () => ({ state });
    f.verify = async () => {
      throw Error("must not verify a nonexistent image");
    };
    assert.deepEqual(await resolveDependencyImage(f), {
      state,
      reference: expected.baseImage,
      identity: expected.identity,
    });
  });

const mutations = {
  "different builder cohort": (f) => {
    f.proof[0].verificationResult.statement.predicate.builder.buildx =
      "v0.38.2";
  },
  "different identity": (f) => {
    f.proof[0].verificationResult.statement.predicate.identity = `sha256:${"0".repeat(64)}`;
  },
  "different file mode": (f) => {
    f.proof[0].verificationResult.statement.predicate.files.Dockerfile.mode = 493;
  },
  "different subject": (f) => {
    f.proof[0].verificationResult.statement.subject[0].digest.sha256 =
      "0".repeat(64);
  },
  "different repository": (f) => {
    f.proof[0].verificationResult.signature.certificate.sourceRepositoryURI =
      "https://github.com/other/repo";
  },
  "different workflow": (f) => {
    f.proof[0].verificationResult.signature.certificate.subjectAlternativeName =
      "https://github.com/other/workflow";
  },
  "untrusted source ref": (f) => {
    f.proof[0].verificationResult.signature.certificate.sourceRepositoryRef =
      "refs/heads/untrusted";
  },
  "forged source revision": (f) => {
    f.proof[0].verificationResult.statement.predicate.sourceSha = "0".repeat(
      40,
    );
  },
  "self-hosted producer": (f) => {
    f.proof[0].verificationResult.signature.certificate.runnerEnvironment =
      "self-hosted";
  },
  "missing architecture": (f) => {
    f.descriptor.manifests.pop();
  },
  "duplicate architecture": (f) => {
    f.descriptor.manifests.push(f.descriptor.manifests[0]);
  },
  "invalid index digest": (f) => {
    f.descriptor.digest = "latest";
  },
  "failed cryptographic verification": (f) => {
    f.verify = async () => {
      throw Error("invalid signature");
    };
  },
};
for (const [name, mutate] of Object.entries(mutations))
  test(`resolver rejects ${name} without downgrading to a cache miss`, async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(resolveDependencyImage(f));
  });

test("CLI bridge uses repository, workflow, main-ref and hosted-runner verification", async () => {
  const f = fixture();
  const output = verifyImage(
    `${image}@${digest}`,
    { repository, workflow },
    (command, args) => {
      assert.equal(command, "gh");
      assert.deepEqual(
        args.filter((arg) =>
          [
            "--cert-identity",
            "--cert-identity-regex",
            "--signer-repo",
            "--signer-workflow",
          ].includes(arg),
        ),
        ["--cert-identity"],
        "gh accepts exactly one certificate identity selector",
      );
      assert(args.includes("--deny-self-hosted-runners"));
      assert(
        args.includes(
          `https://github.com/${repository}/${workflow}@refs/heads/main`,
        ),
      );
      assert(args.includes("refs/heads/main"));
      assert(args.includes(PREDICATE_TYPE));
      assert(!args.includes("--bundle-from-oci"));
      return JSON.stringify(f.proof);
    },
  );
  assert.deepEqual(output, f.proof);
});

test("attestation service outages use the frozen-install path while invalid proofs still fail", async () => {
  const f = fixture();
  f.verify = async () => {
    throw new CacheUnavailableError("service unavailable");
  };
  assert.equal((await resolveDependencyImage(f)).reference, expected.baseImage);
  const network = () => {
    throw Object.assign(Error(), {
      stderr: Buffer.from("net/http: TLS handshake timeout"),
    });
  };
  assert.throws(
    () => verifyImage(`${image}@${digest}`, { repository, workflow }, network),
    CacheUnavailableError,
  );
  const invalid = () => {
    throw Object.assign(Error(), {
      stderr: Buffer.from("signature verification failed"),
    });
  };
  assert.throws(
    () => verifyImage(`${image}@${digest}`, { repository, workflow }, invalid),
    (error) => !(error instanceof CacheUnavailableError),
  );
});

test("lookup distinguishes missing/unavailable caches from unexpected execution failures", () => {
  const missing = () => {
    throw Object.assign(Error(), {
      stderr: Buffer.from("manifest unknown"),
      status: 1,
    });
  };
  const unavailable = () => {
    throw Object.assign(Error(), {
      stderr: Buffer.from("TLS handshake timeout"),
      status: 1,
    });
  };
  assert.deepEqual(lookupImage(`${image}:${expected.tag}`, missing), {
    state: "miss",
  });
  assert.deepEqual(lookupImage(`${image}:${expected.tag}`, unavailable), {
    state: "unavailable",
  });
  assert.throws(() =>
    lookupImage(`${image}:${expected.tag}`, () => {
      throw Object.assign(Error(), { code: "ENOENT" });
    }),
  );
  assert.throws(() =>
    lookupImage(`${image}:${expected.tag}`, () => "invalid JSON"),
  );
});
