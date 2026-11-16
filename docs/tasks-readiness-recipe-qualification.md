# Tasks readiness recipe qualification

Status: source-qualified locally; first hosted proof exposed an incomplete maintenance-note contract. Corrected actual hosted proof remains pending.

Tasks draft PR30 binds source6b896f6d33bd5256c0838c6fde5e8effd6cff7dc and its new
four-file release-helper closure. The old Tasks receipt at479f9c76 is retained
as historical evidence and is not reused for these changed bytes.

The manual main-only `Qualify actual portable version recipe` workflow exposes
`tasks-readiness-changesets3`. It selects that exact public source, preserves
CLI3.0.3, pnpm10.34.5, Changesets config, lock graph and the unchanged
`node scripts/release.mjs version` command. It restores only the authentic
`.changeset/api06-host-compatibility.md` bytes from00d8b192, SHA256
`ed91c7e51adc02324fa59b768af1f60aac233180f5b65cd322a0772b75994d5c`.
The note's actual type is patch. Current source has two empty maintenance
notes, so restoring historical input does not assert current release intent.

Qualification must prepare exactly Tasks0.2.1→0.2.2 in the disposable checkout.
The package and runtime manifest advance together; the lock graph and every
other public field remain identical. The owning canonical chapter may change
only its release-version marker. Bound helper/config/workflow bytes stay
unchanged, changelog preparation must appear, maintenance notes may only remain
unchanged or be consumed, and unrelated changes/new files fail closed.

The existing fixture guard still requires the known main-hosted disposable
consumer checkout, detached exact source and local compare-and-create baseline.
The normal source-owned command actually executes after frozen installation
and source-input verification. Deno remains absent; only the existing read token
serves the real GitHub changelog lookup. No writer App, source commit, tag,
registry upload or GitHub release is created by this workflow.

The exact new source-case test initially failed1/1 because the new case was
absent. It now passes. Fourteen focused tests cover selection, source/config
closure, single-patch planning, unchanged package/runtime contracts and graph,
canonical-only output, bound scripts/workflow, changelog, maintenance notes and
unapproved changed/untracked paths. These are contract/unit proofs, not an
actual source-command receipt.

The original source qualification passed170 tests. The actual hosted source
command subsequently ran in43934760205 on accepted shared7981eda8, prepared
the expected single patch and passed version/graph/source checks, but correctly
failed the incomplete changed-path contract. That failed receipt is not proof
of accepted qualification.

After the shared source lands and its main checks qualify, dispatch the exact
new case on main. Inspect the immutable receipt's source/input hashes, actual
planned versions, before/after outputs and changed paths. Only a successful
real run can close Tasks PR30's pending recipe gate; ordinary functional CI and
proposed guard hashes cannot replace it. Final Tasks head checks and source
pin review remain required before merge/deployment.

## Complete maintenance-note input contract

Reviewed source6b896f6d also contains the older empty
`.changeset/maintenance-rekor-recovery.md`, in addition to the readiness note.
Changesets consumes existing empty notes while preparing the genuine patch.
The initial harness bound only the newer note and rejected the normal older-note
consumption as an unreviewed path. The owning source version command is unchanged;
the proof's input/expected-output contract was incomplete.

The case now binds all13 exact inputs, including the older note's SHA256
`100a32a43cfb5e587cf40c059f71dbe1a24e1d31e705fe05e8695f5445dd4253`.
Its explicit two-path maintenanceNotes list must match the reviewed Tasks
contract. Each note must be empty frontmatter and may independently remain
byte-identical or be consumed. Its reviewed body cannot change, no release
intent may be added, no source hash may be missing and unrelated Changeset
paths remain rejected. There is no wildcard note exception.

The exact existing positive Tasks output target first reproduces1 failure with
the same unreviewed-path assertion when the real two-note behavior is included,
then passes1/1. The complete Tasks/Docs case/output suite passes40 tests,
including all four keep/consume combinations, changed historical body, added
release intent, missing note binding and unrelated Changeset paths. The complete
shared source verification passes199 tests; formatting and actionlint pass.
Unexpected-path diagnostics now identify the rejected paths without weakening
the assertion. A new successful actual hosted run on the corrected contract
is still required before Tasks PR30 may merge.
