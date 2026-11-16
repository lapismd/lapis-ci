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

The manual workflow now offers only three source-owned case IDs. A validated
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
