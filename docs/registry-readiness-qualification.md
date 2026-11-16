# Shared readiness source qualification

Enclosing Jujutsu change: `xmtmunnl`, based oncfadc458. This implementation
extracts the qualified Notes readiness boundary at9d445169, deployed through
Notes PR144/mainb23f596c, into a source-pinned Lapis CI helper with separate
fixed npm11/pnpm10 adapters. It changes no image, toolchain version, consumer
manifest, registry tag, package version or publication authority.

The exact new shared-entrypoint target initially failed1/1 because no helper
existed. It now exercises abbreviated metadata identity before installation and
passes. Focused evidence covers metadata/body bounds, owner budgets, request
time, delayed waking, installation deadlines, Retry-After, missing versions,
identity/integrity/permission/parse rejection, exact ETARGET/NDJSON admission,
unrelated errors, fresh caches and private platform rejection.
An exact cleanup-order regression also reproduced1 failure: readiness was
reported before asynchronous cache removal. Cleanup now precedes readiness and
retry deadline decisions; the same target passes with no cache remaining.

Four cold real-package-manager protocol cases use Node24.15.0, npm11.12.1 and
pnpm10.34.5 against disposable loopback registries and unique package identities.
For each manager, one case holds stale metadata before installation and another
proves the exact missing-version install failure, a new cache, and subsequent
successful installation of the unchanged SHA512-bound fixture. npm's root
postinstall exits99 if scripts execute, proving the selected ignore-scripts
profile. pnpm retains Notes' explicit default-peer/script behavior.

The initial protocol matrix passed three cases but pnpm's installation case
did not observe the intended pending phase. Unique package names eliminated
possible warm content reuse; the failure persisted. The fixture's actual issue
was identifying helper requests by an Accept header pnpm also uses. Distinguishing
the real probe and installation phases fixes the fixture; all four original
protocol targets pass without loosening retry, identity or install assertions.

Real process proofs cover a deadline killing its parent/descendant group,
successful parent exit cleaning its background descendant, and an8MiB output
bound terminating the owned installer. The runner refuses publication and
arbitrary executables. A real npm version mismatch stops before installation.
The source-pinned setup exposes only one importable module path; it runs no
package operation and receives no credentials.

Local `pnpm verify` passes153 tests; all20 focused tests, formatting and actionlint
also pass. The pre-existing unfinished Terminal-native case was reproduced as one
failure and preserved in its separate changeqlsspqvy/53028a48; it is not removed,
waived or included in this independent source branch. Image build/smoke remain
the ordinary hosted CI gate; no image input changed in this slice.

Tasks source inspection subsequently confirmed its publication workflow already
installs npm12.0.2. The original npm11-only adapter cannot be substituted for
that contract. An exact new profile regression reproduced1 failure before a
separate `npm12-strict-peers` profile was added; the npm11 profiles retain their
original major restriction.

`qualify-registry-npm12.mjs` verifies the exact official npm12.0.2 tarball SHA512,
bounds and checks archive paths/types, and extracts it into a disposable tool
directory. It runs21 focused tests on Node24.15.0 with the isolated npm12 and
existing pnpm10.34.5, including all four actual propagation cases. It verifies
the original global npm version remains unchanged and removes the temporary
tool directory. No signing credential enters this qualification environment.
The ordinary hosted CI source job runs the same command; image/toolchain inputs
remain unchanged. This is qualification of an existing publisher tool, not a
consumer toolchain downgrade or a global install.

The npm12 archive integrity is
`sha512-uIXokLlBj6FpNUTQX1PmT5pz7BlIN9QlixX+zdaSNHsd0qUXsbDLr50xzY6Sw7cJVr0uzHKDOle0swmPW/p5Qw==`.
The initial complete source suite remains recorded above; the expanded suite
passes156 tests, including the archive/profile/workflow controls. Formatting and
actionlint also pass. The updated exact hosted run must still pass before
consumer adoption.

Pending: hosted acceptance and shared source landing, then source-owned Tasks,
whose [new helper-closure recipe case](tasks-readiness-recipe-qualification.md)
must run successfully before its draft source can merge,
Docs and Mira adoption at an immutable helper pin, preserving each owner's
reviewed budget, strict peers, npm ci, signatures, provenance, publint and
skip-different publication disposition. Notes deduplication follows its own
qualified replacement. A successful fixture is not genuine publication proof;
no package bump or publish is manufactured for acceptance.
