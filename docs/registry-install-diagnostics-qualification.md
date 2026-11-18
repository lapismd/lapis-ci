# Registry install failure diagnostics

This source-owned repair is based on Lapis CI main
`5cb7a35031c7e83e0d41ef3ce3209e958076119b`. It changes no image input,
toolchain version, package recipe, owner budget, candidate classification,
publication policy or credential handling.

## Original boundary and regression

Notes release run44232734973 used source
`538bb4697839a788f041e1830465907e10f50bba`. Its four public next-channel
publications succeeded, but clean registry installation failed once with
`REGISTRY_INSTALL_FAILED` after35.8 seconds of the110-second owner budget.
The runner attached approximately988KiB of pnpm NDJSON stdout to its Error.
Default Node error inspection displayed only the first10KiB, dropping the
terminal error. This prevented an honest classification of the actual failure.

A real fake-manager process emits a progress prefix larger than10KiB followed
by a typed terminal pnpm error. The exact regression initially fails1/1 because
the error disappears from default inspection. After the repair it passes while
credential-bearing URL components, arbitrary message/header/environment fields
and raw output stay out of the rendered failure. The original bounded bytes
remain available to the existing classifier.

The diagnostic-only projection retains at most four terminal records with typed
bounded fields. Only valid npm package names, semver versions and exact specifiers and safe
HTTP URL coordinates are rendered. Missing, invalid, malformed and oversized
records have no raw-text fallback. The combined process output cap remains8MiB;
owned cancellation, timeout, signal and exit behavior are unchanged.

Focused tests retain both accepted exact candidate ETARGET/NO_MATCHING_VERSION
cases and refusal of FETCH404, unrelated candidates, peer/integrity/auth errors,
extra or unstructured output. No retry is inferred from this diagnostic view.

## Actual public-registry control

A fresh credential-free worker recovers the exact six-package consumer manifest
from the retained Notes538 pnpm event and the source-owned onlyBuiltDependencies
policy. It uses published UI0.2.4, API0.6.9, Workspace0.4.8 and Profile0.2.6 with
the reviewed SHA512 identities, Node24.15.0, pnpm10.34.5, the unchanged default
peer profile, public npm, fresh metadata cache and110-second owner deadline.
Package scripts are explicitly disabled for this diagnostic control. HOME and
npm configuration are isolated; no Notes checkout or repository snapshot exists.

That later control passes on its first attempt in10.7 seconds. It does not prove
the original scripts-enabled failure cause, full consumer build, or hosted release
completion. API's advertised tarball returned404 during an earlier independent
read-back, but no retained installer error connects that observation to the
original failure. It therefore supplies no authority to add FETCH404 retries.

## Exact scripts-enabled Docker controls and bounded recovery

Two further cold controls use the original immutable Notes CI image
`ghcr.io/lapismd/lapis-notes-ci@sha256:f5d221683a6f1069f003b06831b4faee4c5cd304cb5b9ae32e3a5da620865db1`.
Each has4 CPUs,12GiB memory, dropped capabilities, a read-only root filesystem,
executable scratch, a non-root user and no bind mounts, HOME/profile inputs or
credentials. Minimal public inputs and reviewed helper files arrive over stdin;
this is not a Notes repository checkout or snapshot. Scripts and the original
onlyBuiltDependencies policy are enabled without changing readiness arguments.

The current diagnostic helper passes on attempt1 in11.9 seconds. The original
Notes-pinned helper69a81e05 also passes on attempt1 in9.5 seconds. Both verify
installation of the four exact published versions. The initial sandbox preflight
ran outside the consumer packageManager directory and failed before installation;
corrected consumer-cwd selection and executable isolated scratch preserve the
actual contract without changing host tools. That setup failure is retained
separately from the successful package controls.

These passes do not recover the original lost terminal error. Its cause remains
unknown. All four registry tarballs and SLSA source/run/subject identities now
match the original source538 artifact and publication attempt1; npm next tags
match the four versions and latest remains0.1.0.

At the original failure, package GitHub releases and the ordinary dependency
notification were correctly skipped. GitHub's specific failed-job recovery can
reuse the same source/run/artifact and rerun verification plus dependent jobs
without rerunning successful publication. Notes' immutable verifier and artifact
name have no attempt suffix; an independent coordinator S5 regression separately
proves origin attempt1 and verification recovery attempt2 with the same artifact.
This recovery cannot select a new helper pin. Future diagnostic adoption is
separate. The central rollout tracker owns actual delivery/recovery status; this
source record does not claim the recovery has completed.

## Verification

The focused process/diagnostic/readiness suite passes21 cases. Complete
`pnpm verify` passes316 tests and the owned repository contract. The official
npm12.0.2 compatibility/protocol matrix passes25 cases and proves the global npm
is unchanged. Formatter and actionlint pass. No native image input changed;
ordinary hosted source checks and image smoke remain separate gates.

This repository has no spec-validator dependency, canonical spec tree or QMD
task. This owning readiness contract and qualification record govern the helper.
