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

This is the first part of the producer/resolver contract. Before a consumer
replaces its current pins, it must assemble the context for the candidate,
compute its identity, and verify an attestation binding that identity and its
inputs to the returned immutable multi-architecture image digest and trusted
producer. Invalid provenance must fail closed. A missing optimization must run
the reviewed toolchain with the exact candidate's frozen install. Neither a
lookup tag nor this unsigned input receipt proves an image's provenance.
Existing image producers, digest pins and review workflows remain active until
that source-owned migration is qualified.

Qualification on 2026-11-15: focused target initially failed once for the missing
module; repaired tests pass 4/4 and the full repository suite passes 11/11.
Tests cover every required input's bytes, modes, nested manifests, patches,
toolchain changes, both platforms, repeatability, forbidden inputs, symlinks,
missing inputs and standalone receipt/output delivery. Plugins' real source
assembler produced a 29-file accepted context. Its public patch README initially
revealed one acceptance failure; allowing and hashing that explicit public data
file repaired the same acceptance command. No image or consumer workflow is
changed by this helper slice. Hosted CI remains pending.
