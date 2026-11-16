# Tasks readiness recipe qualification

Status: locally source-qualified; actual hosted whole-recipe proof pending.

Tasks draft PR30 binds source6b896f6d33bd5256c0838c6fde5e8effd6cff7dc and its new
four-file release-helper closure. The old Tasks receipt at479f9c76 is retained
as historical evidence and is not reused for these changed bytes.

The manual main-only `Qualify actual portable version recipe` workflow exposes
`tasks-readiness-changesets3`. It selects that exact public source, preserves
CLI3.0.3, pnpm10.34.5, Changesets config, lock graph and the unchanged
`node scripts/release.mjs version` command. It restores only the authentic
`.changeset/api06-host-compatibility.md` bytes from00d8b192, SHA256
`ed91c7e51adc02324fa59b768af1f60aac233180f5b65cd322a0772b75994d5c`.
The note's actual type is patch. Current source has only an empty maintenance
note, so restoring historical input does not assert current release intent.

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

Local `pnpm verify` passes170 tests. The14 focused case/output tests, formatting
and actionlint pass. The real hosted source command has not run yet and no
version-recipe receipt is inferred from these local results.

After the shared source lands and its main checks qualify, dispatch the exact
new case on main. Inspect the immutable receipt's source/input hashes, actual
planned versions, before/after outputs and changed paths. Only a successful
real run can close Tasks PR30's pending recipe gate; ordinary functional CI and
proposed guard hashes cannot replace it. Final Tasks head checks and source
pin review remain required before merge/deployment.
