# Dependency-image input receipts

Lapis CI owns this reusable identity contract. A consumer owns its dependency
Dockerfile, context assembly and package-specific layers. The shared toolchain
image remains free of repository source, credentials and package dependencies.

The `actions/dependency-identity` action takes `context`, `base-image` and an
optional `receipt` path. It requires Node 24 or newer and needs no npm install,
token or write permission. It emits `identity`, `tag` and `receipt` outputs.
The receipt must be outside the context to avoid hashing its own generated
identity. Consumers must pin this action by reviewed commit SHA.

The standalone equivalent is:

```bash
node scripts/dependency-identity.mjs \
  --context /path/to/prepared/context \
  --base-image ghcr.io/lapismd/lapis-ci@sha256:<reviewed-digest> \
  --receipt /path/outside/context/receipt.json
```

The source assembler must include every input read by its Docker build. The
helper hashes the actual assembled context, including required Dockerfile,
root package manifest, lockfile and workspace configuration; nested package
manifests; patches and public patch notes; and optional `context.json` metadata.
It records file permissions and directory presence/modes. It rejects symlinks,
source scripts, installed packages, hidden files such as `.npmrc`/`.env`, and
other unexpected files. Authentication must never be copied into this context.
Directory depth, entry count and total input bytes are bounded.

Identity is SHA-256 over the canonical ordered schema, immutable base digest,
the ordered `linux/amd64`/`linux/arm64` platform pair, directories and files.
The lookup tag includes the complete digest, with no truncated hash. Repository,
source commit and workflow metadata are recorded separately in the receipt;
documentation-only source changes need not invalidate identical build inputs.

Before a consumer
replaces its current pins, it must assemble the context for the candidate,
compute its identity, and verify an attestation binding that identity and its
inputs to the returned immutable multi-architecture image digest and trusted
producer. Invalid provenance must fail closed. A missing optimization must run
the reviewed toolchain with the exact candidate's frozen install. Neither a
lookup tag nor this unsigned input receipt proves an image's provenance.
Existing image producers, digest pins and review workflows remain active until
that source-owned migration is qualified.

## Verified resolver

`actions/resolve-dependency-image` takes the candidate `context`, `base-image`,
dependency `image`, trusted source `repository`, and publication `workflow`.
It requires Node, Docker Buildx and GitHub CLI from the reviewed CI toolchain.
The caller provides ordinary read access for registry and attestation lookups;
the resolver never mints an App token or uses a signing key. Pin the action to
a reviewed commit. Inputs are passed through environment variables and argv,
without shell evaluation.

The resolver recomputes identity from the context rather than trusting a saved
unsigned receipt. It resolves a lookup tag to an immutable OCI/Docker index,
requires exactly the expected Linux amd64/arm64 runtime descriptors, and invokes
`gh attestation verify` with the source repository, exact main-branch workflow
identity, source ref, hosted-runner restriction and custom predicate type
`https://lapis.md/attestations/dependency-image/v1`.

After signature verification, policy checks the subject digest, complete input
receipt, repository/workflow and producer source commit. The source commit must
match the signed certificate's source and signer digests. Metadata asserted by
the workflow alone cannot supply certificate identity. The output exposes only
the accepted immutable `reference`, input `identity`, and `state`.

`hit` returns the verified dependency-image digest. `miss` and known registry or
attestation-service outages (`unavailable`) return the reviewed base digest.
All paths require an unconditional candidate frozen install in the source CI
setup. Unknown execution errors, malformed manifests, missing architectures,
invalid signatures and mismatched provenance fail closed. They never become
cache misses. Reports are written outside the context; the resolver performs
no registry/GitHub writes.

Producer adoption must build under a staging tag, attest the multi-architecture
digest with the generated input receipt, and only then publish the full identity
lookup tag pointing to those exact bytes. This prevents a resolver from seeing
a half-published cache entry. A valid existing identity should reuse its verified
digest. The source repository retains image publication, signing permissions and
its frozen-install gate; this helper does not grant that authority.

The CLI field/flag contract was checked against the
[GitHub CLI verifier](https://cli.github.com/manual/gh_attestation_verify),
the CLI v2.102.0 verification implementation, and its Sigstore Go v1.3.0
certificate JSON schema. Producer custom-predicate support is documented by
[actions/attest](https://github.com/actions/attest).

Qualification on 2026-11-15: focused target initially failed once for the missing
module; repaired tests pass 4/4 and the full repository suite passes 11/11.
Tests cover every required input's bytes, modes, nested manifests, patches,
toolchain changes, both platforms, repeatability, forbidden inputs, symlinks,
missing inputs and standalone receipt/output delivery. Plugins' real source
assembler produced a 29-file accepted context. Its public patch README initially
revealed one acceptance failure; allowing and hashing that explicit public data
file repaired the same acceptance command. No image or consumer workflow is
changed by this helper slice. Hosted CI remains pending.

The input-identity PR #2 is now merged as `982b122a`; hosted native image build
and smoke check 43754667449 passed. The resolver addition initially failed one
missing-module target, then passed 18 focused cases. They cover warm acceptance,
cold/missing caches, service outages and strict rejection of tampered receipts,
subjects, source/workflow identity, signatures and platform indices. Real
read-only GHCR lookup of Plugins' current candidate returned `miss` and the
reviewed base digest for its same 29-file identity. Positive signed-receipt
publication and actual cold/warm consumer execution remain acceptance work for
the source producer migration.
