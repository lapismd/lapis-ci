# Shared Node versioning runtime guard

The source action validates a source-owned recipe without duplicating an
implementation in each consumer. It belongs to Lapis CI alongside the shared
toolchain actions; coordinator cohort metadata and consumer-specific release
commands retain their own ownership.

## Guard contract

- The caller must already provide Node24 and its frozen installed dependency graph.
- The installed CLI must exactly match a reviewed version, Node engine metadata, package metadata and every direct JS module in `changesets-runtime.json`.
- A project-relative qualification file must bind exact config bytes, pnpm version, named script commands and recipe source files.
- Unknown lifecycle hooks, changed config/scripts/files, unsafe/symlink-escaped paths and project/ancestor Deno formatter declarations fail before writer authority.
- The helper must not run or rewrite version commands, add credentials, install a runtime, force formatting policy or alter consumer gates.

The data covers CLI2.31.1 and3.0.3, whose current official npm integrity metadata
matches the reviewed coordinator contracts from PR18. Their tarballs were
previously integrity-verified in fresh scripts-disabled Node24 fixtures. This
source additionally hashes all13/23 direct executable/package files, including
the actual compiled module bodies and package JSON. The package's transitive
dependencies and arbitrary project scripts are not a complete static security
analysis. Frozen install, audit/current-head functional qualification and
source-owned whole-recipe proof remain necessary.

A consumer file has schemaVersion1, cliVersion, packageManager, configSha256,
scripts (including release:version) and files (relative path to SHA256). It
contains reviewed public metadata only. The guard reads it from the checked-out
source; consumers must commit that data only after qualifying their actual
recipe. A proof URL in prose does not independently verify workflow success.

Use the action after the source's existing frozen setup and releasability check,
before its existing App minting step. Supply `working-directory` and
`qualification-file`; keep the existing version action's command/authentication,
commit mode, activation and package publication/signing approvals unchanged.
The actual adoption must pin the helper's reviewed commit, never a branch/tag.

## Explicit AI native profile (hosted recipe qualified)

Node24 remains the default. A source qualification MAY explicitly select
`nodeMajor: 22` only for a CLI whose reviewed runtime contract includes it.
Current additional review is limited to CLI2.31.1; all existing qualification
files retain Node24 without modification. This runtime-input acceptance is not
whole-recipe or native qualification.

The fixed AI case retains source Node22, Rust1.99.0, pnpm10.34.5 and the actual
`pnpm release:version` wrapper. Its profile MUST verify official Node/cargo/rustc
executable hashes, at least30GiB free, the source's frozen hook policy, native
release check and real locked Cargo bootstrap before the unchanged offline
recipe. Missing tools, wrong bytes, missing caches or any failed command MUST
fail qualification. No Deno, credentials, writer App or publisher participates.
The Node24 GitHub-changelog cases retain their existing read-only token step.
Tool preflight precedes source install hooks; the unchanged managed-Cargo
bootstrap checks its free-disk threshold again after installation.

AI's genuine ancestor note is disposable validation input only, never current
release intent. Before/after evidence MUST establish both private npm versions,
all15 coordinated Cargo records, internal ranges, lockfiles, both changelogs,
applicable README install commands, note consumption and unchanged canonical
and milestone evidence. Only a successful actual hosted proof permits a later
source-owned AI guard adoption. The existing Node22 consumer workflow, command,
CLI major, publication/tag orchestration and native gates remain unchanged.

### Reviewed AI inputs and current evidence

The fixed `ai-changesets2-native` case selects current public source
`3e29e16f15652ba239d256af49ffcba314355a5e`. It restores only the genuine
`bounded-stream-handoff.md` note from ancestor
`46fceebd76bfcdcc6e5e629205e1779406ead3d3`, whose SHA256 is
`fa167ff89119d3f8e6200b751278260bbd866118576c1bdcd3251dc8a6771ff2`.
That note is already consumed in source history and is labelled historical
validation input, never an intention to release another version.

The case binds77 captured source/lock/manifest inputs and17 stable recipe,
configuration and transitive import files. Inactive image installer, worker,
smoke and routing-audit files are not runtime-guard inputs. Cargo and pnpm
lockfiles remain immutable inputs to this proof; package versions are changed
only in its fenced disposable checkout. Full current-source CI and audit gates
remain required independently of the runtime-input guard.

The official Node22.23.5 linux-x64 archive was verified against its published
SHASUMS256; official Rust1.99.0 cargo/rustc archives were verified against the
2026-10-01 channel manifest. Extracted executable hashes are tracked public
review inputs in the case. Actual Node22 and cargo version probes passed; both
installed Rust executable hashes in the existing qualified AI tool image match
the official archive bytes. The hosted profile independently checks installed
bytes and versions again before actual bootstrap. No image inputs changed.

The new explicit Node22 guard regression failed1/1 before the repair and passes
1/1 afterward. Focused runtime/native/fence tests pass26/26; the complete helper
suite passes88/88 on Node24. Native/runtime unit controls pass21/21 on the actual
official Node22.23.5 binary. An intermediate full run had72 passes and one
command-shape assertion failure; retaining the default install invocation
literally restored that existing assertion without weakening it. Actionlint1.7.12
and formatting pass. Unit fixtures test missing/wrong tools, disk, credentials,
Cargo/client/range drift, stale install commands and changed canonical evidence;
they do not stand in for real offline preparation.

Hosted [43814544020](https://github.com/lapismd/lapis-ci/actions/runs/43814544020)
passed on helper `2f90eb7a035f841f0757d3a2cffc959cbecdfff0`. The complete
receipt independently matches all77 source hashes and17 stable guard inputs,
prepares both private versions0.2.0→0.3.0 and all15 Cargo records, and preserves
all59 canonical files. The genuine historical note remains explicitly
`currentReleaseIntent=false`; Deno, writer App minting and publication remain
absent. Official tool bytes, the real locked bootstrap and unchanged offline
source command all qualified. This completes recipe proof, not consumer
adoption: the separate AI source PR and current-source CI remain required.
The main-only disposable fence and all missing-tool/unknown-evidence gates are
unchanged; no dummy release or secret retrieval was used.

## Actual Plugins proof

The fixed case in `version-recipe-cases.json` selects public Plugins commit
`03edd845b35cb3e33f4c963fce3ea787f8e373c4`, with genuine pending note
`.changeset/quiet-remotes-keyboard.md` (SHA256
`0e46a5c01028001efd1a88cacaf3a89a86404db04e840e0090e214c06e325267`).
That source's later version commit consumed the note; no synthetic changeset
or package bump is introduced into a repository for qualification.

All nine selected recipe files have identical hashes at current Plugins main
`75c7190341d34210d62b20552c324b9bd12ef6f9`; its unchanged config also matches.
The real command remains `pnpm release:version` running
`node scripts/version-public-packages.mjs`, including `packages:sync` and
`audit:bases --refresh-provenance`. The source's CLI remains2.31.1, its custom
GitHub changelog and held-package handling remain intact, and genuine Bases
compatibility/provenance tests must execute successfully.

The manual hosted workflow checks out only the reviewed helper and that exact
public source, with persisted credentials disabled and full history for real
changeset ancestry. It provides Node24.15.0 and pnpm10.34.5, performs a fresh
scripts-disabled frozen install, then restricts PATH to explicit Node/pnpm/Git/
shell utilities. Deno must be absent before and after execution. The existing
read-only `github.token` supplies changelog API reads; no secret value is
retrieved/exported by tooling and no writer App token is minted.

An exact-SHA checkout is detached and may have no local `main` reference, even
with full history. The fixture verifies its known hosted repository/workflow/
main-ref context, exact workspace/consumer path, direct unshared Git metadata,
detached HEAD and selected immutable source before creating an absent local
`refs/heads/main` at that same source. Compare-and-create refuses any concurrent
or conflicting existing ref. HEAD remains detached; source, config, command and
genuine note bytes are unchanged. The helper cannot target another checkout or
write a remote/user repository main ref, and a matching fixture baseline is
idempotent. This fixture-only metadata step runs before install and Changesets
status; it is not a product recipe or config adaptation.

The script requires an actual nonempty release plan, executes the unchanged
whole version command, verifies prepared versions and changed changelogs, and
checks genuine note consumption. The receipt records exact bindings, resulting
release versions and source file changes, with published=false and
writerAppMinted=false. Failure receipts contain a bounded generic reason, not
API bodies or credentials. The uploaded JSON is an operational artifact and
must never enter tracked source or a public documentation artifact.

## Local and hosted evidence

The original new regression failed once because its module did not exist.
The repaired guard targets pass5/5, covering both majors, Node24 rejection,
changed bytes/config/commands, lifecycle hooks, extra code, path escape and Deno
formatter inputs. The full source verification passes49/49. The guard also
accepted the actual current local Plugins CLI2/config/nine source files on
Node24.19.0, without executing a version recipe or granting write authority.
An initial post-format full run exposed one whitespace-sensitive command-shape
assertion (48 passed,1 failed); the assertion retains the exact command and now
accepts formatter whitespace, with the exact target and full suite rerun.

That input acceptance is not the whole-recipe proof. Hosted execution must
succeed at the immutable genuine pending source before consumer adoption is
qualified. The upstream PR, hosted proof receipt and consumer adoption must
remain separately reviewable. Existing frozen Deno consumers are held rather
than adapted to fit this guard.

The first genuine hosted proof43782933999 installed the frozen graph and
accepted the source runtime guard, then failed at Changesets status because
the detached fixture lacked `main`; no version mutation occurred. The local
underlying Git boundary reproduced exactly once with exit128. The fixture
repair's four tests cover that missing-ref control, exact merge-base/HEAD
identity, byte preservation, idempotence and non-hosted/misplaced/attached/
wrong-source/conflicting-ref rejection. The actual status, whole-recipe and
mutation assertions remain mandatory; hosted proof must be rerun after review.
Local repair qualification passes4/4 focused tests and53/53 full source tests
on Node24, plus actionlint. No Docker/image input, consumer recipe/config,
selected source SHA, genuine note or existing proof assertion is changed.

No image tool/version, Docker input or application source changes in this
slice. The Dockerfile still copies only versions.json and verify-image.mjs;
the shared helper is downloaded as pinned action source instead of changing
the image. Existing native image qualification remains in hosted CI.

## Root and workspace CLI3 qualification cases

The corrected Plugins proof [43785402039](https://github.com/lapismd/lapis-ci/actions/runs/43785402039)
passed on helper source `c6f5827520787256cce793a1a33b75f86e14bd81`.
Its actual status, version, changelog, metadata sync and Bases checks ran with
Node24.15.0, pnpm10.34.5 and Deno absent. That success applies to the reviewed
Plugins closure; it does not qualify other repositories or CLI majors.

The manual workflow offers only reviewed source-owned case IDs. A validated
selector reads immutable repository/SHA/pnpm coordinates from tracked data;
dispatch input cannot supply a repository, ref or command. Each case retains
the read-only token, full-history detached checkout, frozen scripts-disabled
install, mandatory nonempty status, unchanged `pnpm release:version`, version/
changelog/note-consumption assertions and no-Deno boundary. Package discovery
uses the installed CLI's own `@manypkg/get-packages` dependency and includes
the root manifest. This supports both a public root package and workspace
layouts with private adapters without replacing the consumer's selection rules.

| Case               | Exact recipe source                                | Pending-note source                                                                                                                    | Current closure comparison                                                                                                                                                        |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core-changesets3` | `1c5692bb840cce4e0541a29e5876838f483b6000`         | Genuine `responsive-shell-focus.md` at that source                                                                                     | Current `9cf94b7ce62d679aca77d6d5c65fe84405f086b9`: root manifest differs only in its own version0.13.3→0.13.4; lock, command, config, formatter and workspace policy bytes match |
| `mira-changesets3` | Current `d681bdd6b9f500a554f18e8ac3c4c9cdfa24eed5` | Exact `async-embed-activation.md` from ancestor `42988233a4d68e5ec8c6dfbd2d92e97868a4ad62`, restored only as labelled validation input | Current lock/root manifest, all workspace manifests, editor version input, workspace/formatter/config and both local helper modules are explicitly SHA256-bound                   |

Both cases retain CLI3.0.3, pnpm10.32.1 and their actual commands/configuration.
Core's command prepares its public root package, refreshes the lock and formats
the root manifest/changelog. Mira's command additionally runs its existing
`sync-release-versions.mjs --write` and existing formatter globs. The fixture
then invokes the same source helper's `--check` to verify editor metadata.
Hashes live in `version-recipe-cases.json`, including the different raw Core
root-manifest hashes; no equivalence is inferred from source CI alone.

Mira's current three maintenance notes have empty release maps. Its historical
note cannot qualify an older dependency graph for current adoption. Instead,
the fixture reads the exact historical Git blob after verifying an immutable
ancestor, absent selected-source path, reviewed SHA256 and the same disposable
hosted checkout fence. It writes only that previously consumed note with
exclusive create semantics. It never stages, commits, pushes, changes product
source/config/recipes, or overwrites an existing note. The receipt labels this
`historical-validation-input`, `currentReleaseIntent=false`, and records both
source SHAs. This tests a real current recipe against a genuine historical
input; it does not claim that current main requests a release or reproduce the
historical release versions. Publication and writer App minting remain absent.

Before implementation, each new focused test file failed once for its missing
module/export. The repaired layout/selection tests and historical-note test
pass, alongside the existing fixture/guard boundaries. Node24's actual local
CLI discovery sees Core's root package and Mira's six public packages plus
private root/Solid/Vue adapters. Hosted whole-recipe execution for these new
cases remains pending review and dispatch. Neither consumer has adopted a new
guard, changed a recipe, installed/removed Deno, or gained release authority in
this source-only slice.

Local qualification passes57/57 source tests on Node24, including13 focused
layout/case, fixture and guard tests, plus repository contract, formatter and
actionlint checks. Both actual local CLI3 installations also accept their
source-owned qualification inputs on Node24.19.0; this read-only acceptance
does not execute or qualify the whole recipe. Image inputs are unchanged.

## Tasks and Docs custom release helpers

Two additional cases preserve the current shared recipe family without
replacing either source's implementation: `node scripts/release.mjs version`.
Both retain CLI3.0.3 and their actual Changesets config. Tasks uses pnpm10.34.5;
Docs uses pnpm10.32.1. Their actual source version jobs install frozen registry
dependencies with `--ignore-pnpmfile`; the fixture now adds that exact flag for
these two cases alongside its existing scripts-disabled install. This retains
Tasks' deliberate exclusion of local archive hooks. It does not modify a hook,
consumer script, formatter or runtime prerequisite.

| Case                | Current immutable tuple                    | Genuine note provenance                                                                                                                                                                            |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks-changesets3` | `00d8b1929538bb945078a303343eb4fd5410ce18` | Existing pending `.changeset/api06-host-compatibility.md`, SHA256 `ed91c7e51adc02324fa59b768af1f60aac233180f5b65cd322a0772b75994d5c`                                                               |
| `docs-changesets3`  | `073f4a58ddcb414ad5ce93b4107c4262438290ff` | Exact consumed `.changeset/lapis-dependencies-142f236303c0.md` from ancestor `ee056bff3c8355ac40ae29e2fa40825437da7d8b`, SHA256 `513b55f83b942e2c5c2dcc28c1c1835f4c69603e7fa1b124063b7604cec879e4` |

Docs main has no pending note. Its case uses the same fenced historical-blob
restoration as Mira, explicitly recording historical validation input and
`currentReleaseIntent=false`; it creates no repository release intent. Both
cases record exact current root manifest/lock/config/workflow/helper/workspace
and generated metadata hashes (eight Tasks paths, eleven Docs paths). Tasks'
lock SHA256 is `5fdc31934e2dfc544ff2d4772e27c9c2aca929a9df292b95318cba59ae0376e3`;
Docs' is `38dd03686981c527197d83b083907d1b92f3140d8403497c2ebe79558e3d77ca`.
Whole-recipe proof belongs to these exact tuples; source-green or another
consumer's success cannot supply it.

The helper must synchronize the runtime manifest and its canonical release
marker. Docs additionally updates its validator package-version pin, governance
marker and README package-version marker. Reviewed case data declares these
two/five output paths. The shared fixture verifies each against the actual
planned package version before and after the unchanged full command, records
their hashes, and retains all original version/changelog/note-consumption and
absent-Deno assertions. Wrong/stale output, unknown package, missing marker,
unsafe path or symlink escape fails; the fixture never repairs the consumer.
These metadata checks neither execute an arbitrary case-provided command nor
qualify publication behavior in the unused branches of `release.mjs`.

The new output-boundary regression failed1/1 before its module existed, then
passed after implementation. Full Node24 source verification passes59/59 with
formatter/actionlint; image inputs and tooling versions remain unchanged.
These cases still need actual hosted execution before either consumer adopts
the guard. No source product/recipe/config, Deno exclusion, approval or
activation changes are included in this harness slice.

## Tasks signing-recovery recipe refresh

The current Tasks case now binds source
`479f9c7640a452e8df24c80c7a7eef2d591975da`, ten exact source files and the new
public-SDK signing helper imported by `release.mjs`. CLI3.0.3, pnpm10.34.5,
configuration, workspace policy and the actual version command remain unchanged.
All ten raw file hashes and the historical note bytes were independently read
from that immutable source/history before updating the case.

The API06 note from `00d8b1929538bb945078a303343eb4fd5410ce18` is already
consumed. The existing disposable fence restores it only as historical input,
never current intent, and expects0.2.1→0.2.2 plus both custom version outputs.
The original Tasks proof/table above remains historical and cannot qualify the
new helper bytes. Local exact-source whole-recipe receipt is
`68162fee36d9cc11f7e4b7f0d126f5e172bbe0dee8742249439dc364ba75086d`.
Hosted [43821246307](https://github.com/lapismd/lapis-ci/actions/runs/43821246307)
passed on helper `4b9f1c5d4e51fa6bd667c0f1de5c3d4bd21b30da`. Its receipt
SHA256 is `25f11d144537f5f89e52433d427808c5940db1acce63edf151adf21f89186b2c`.
All ten source hashes, historical-note provenance, actual0.2.1→0.2.2 mutation,
both custom outputs and absent Deno/writer/publication checks passed. This is
recipe qualification; actual package publication remains a consumer gate.

## Docs supported-cohort strict-peer refresh

The current Docs case supersedes its old vulnerable historical tuple. It binds
source `9e8e7ec23fc5d7f412f180e76ebcb3699a00cfed`, all15 captured source files,
and the genuine `.changeset/docs-supported-host-cohort.md` minor note. This
is current release intent, not a restored historical note. Source-owned peers
and Node floor changed intentionally; the installed graph and public consumers
passed the source's strict-peer, functional, accessibility and production-audit
gates independently of this recipe proof.

The optional `strictPeerDependencies` boolean is admitted only for this reviewed
Docs profile and adds `--strict-peer-dependencies` to its scripts-disabled
frozen setup. Omitted/false values preserve every other profile's existing
installation. Nonboolean values and attempts to apply the new policy to another
repository fail before installation. The actual install argument vector is
retained in the receipt, including the separate unchanged AI setup. Source
pnpm10.32.1, CLI3.0.3, ignored local hooks, config and exact
`node scripts/release.mjs version` command remain unchanged.

Two focused regressions failed before the policy validation/flag wiring and
pass afterward. This case must qualify the real0.2.2→0.3.0 mutation, changed
changelog, consumed genuine note and all five custom metadata outputs with
Deno absent. Hosted proof remains pending; neither the old Docs proof nor
this case selection grants guard adoption, publication or a new audit exception.

## Literal Agent UI direct command (source review pending)

An omitted mode retains the existing named `release:version` script contract.
Explicit `mode: "direct"` requires exactly `argv: ["exec", "changeset", "version"]`,
CLI2.31.1 on Node24 and `scripts: {}`; every other mode/argv or hybrid script
binding fails closed. The guard remains input-only and does not execute the
command. Whole-recipe selection permits this direct mode only for the reviewed
Agent UI case, retaining its installed CLI, config, formatter, workspace and
approved package-patch bindings. Literal `@` in a final filename component supports the existing approved patch
path; absolute/traversal/backslash paths and realpath escapes remain rejected.
No consumer wrapper or CLI migration is added.

The case selects immutable source `60826d6d3910a33d3ea1c686786e690160ff2ff3`
from Agent UI PR40. Its source/lock/current tuple binds13 files; runtime guard
inputs retain the four existing formatter/workspace/patch files. The genuine
`compact-identifier-pair-labels.md` note comes only from ancestor
`f2cfeceb8d4b1885694f2976a75893183bac4ea8`, SHA256
`e47b7995f03dbd99bef7e44a7b3689a6ad9d1c2f55da9d915c393855b8847b76`.
It is absent from current source and remains historical validation input with
`currentReleaseIntent=false`, restored only inside the existing main-only
hosted disposable fence. No source note, version intent or publication is created.

The expected mutation is Repository UI0.2.6→0.2.7 only; Agent UI0.2.8 and private
root0.1.0 remain unchanged. The whole runner executes the validated literal argv
and records its actual command, retaining the existing frozen scripts-disabled
fixture install, source-owned PNPM patch and no Deno/extra hook policy. Source
functional/audit gates remain independent, including its recorded unfixed
development LOW finding; no waiver or source guard adoption is implied.

After shared-source review and merge, the operator may dispatch only the reviewed
`agent-ui-changesets2` case on main and inspect the complete immutable receipt,
version/changelog/note outputs and unchanged package versions before source
adoption. Actual hosted whole-recipe acceptance remains pending. No Terminal
case, image input, credentials, writer App or publication authority changes.

Source qualification records one initial direct-mode failure and one initial
legitimate-patch-path failure; both exact regressions pass after the shared fixes.
The complete helper suite passes117 tests, actionlint and pinned repository/tool
checks. Official registry integrity/engine read-back matches both reviewed CLI
contracts (13/23 direct executable/package files). An actual read-only installed
input call at the selected Agent UI source passes on Node24.15.0/pnpm10.34.5 with
CLI2.31.1; it executes no recipe and changes no source or installation. This is
input acceptance only; the real hosted version/changelog/unchanged-package proof
and later consumer adoption remain pending root review.

## Tasks shared-readiness helper closure

The separate `tasks-readiness-changesets3` case binds Tasks draft PR30's changed
four-file helper closure at6b896f6d. It preserves the original Tasks case and
requires exact coordinated package/runtime versions, an unchanged dependency
graph/public contract, version-marker-only canonical output and unchanged
bound source/configuration. The
[Tasks qualification contract](tasks-readiness-recipe-qualification.md) records
the genuine historical patch input, output controls and pending hosted gate.
Preparing this case does not qualify the changed consumer or permit its merge.
