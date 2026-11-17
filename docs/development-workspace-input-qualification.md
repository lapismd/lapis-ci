# Reviewed development data in version inputs

Notebook's exact source input guard accepts its current workspace, then rejects
an otherwise legitimate Core development override0.13.4→0.13.5 because the entire
workspace file is byte-bound. The source-owned version helpers do not import or
execute Core; its development pin is data for this reviewed recipe.

The optional workspace policy masks only that one direct override version.
It retains all other bytes and requires an exact development pin, installed
name/version agreement, a stable reviewed series and minimum patch. Existing
consumers retain exact bindings, and all executable/configuration, lifecycle,
Node/CLI, Deno/formatter and candidate checks remain in force.

The exact runtime regression fails once before support and passes afterward.
Both exact-only and opted-in cases retain their negative controls. All29 focused
runtime/workspace tests and the complete301-test source suite pass on
Node24.15.0. Actionlint and formatting remain required before source publication;
this change does not modify the shared image or toolchain versions.

## Actual Notebook command

A fresh isolated clone of Notebook source4b9ccc3f4c4536a0cae8b7266dba05620f6fa193
resolves and frozen-installs released Core0.13.5 from public npm, with install
scripts disabled and its existing pnpm hook ignored. Both the development pin
and override advance together; its canonical data is refreshed by the existing
shared renderer. The same whole-recipe helpers/configuration remain unchanged.

The reviewed policy uses series0.13/minimum patch4 and normalized workspace
SHA256`1ee11996c7e0a434716de23b031f294b602d3c178d1bce45d0bf368a00475bd1`.
Only an exact historical patch note from ancestorcb79a6a7d294f0f9c83deea7410296db5ecc4fcc
is restored, with SHA256`6e66a0415579039cd45e1316bf3cb1e6d31878f9589260aee443006535d0cfcd`.
This is counterfactual validation input, not production release intent.

On Node24.15.0/pnpm10.32.1/Changesets3.0.3, the unchanged
`node scripts/release.mjs version` succeeds with a restricted PATH where Deno
returns ENOENT. Root package/runtime manifest become0.2.5, the canonical version
marker advances and the changelog is generated; both historical/empty notes are
consumed. All six private manifests, the lock graph, workspace, helper bytes
and every other tracked file remain identical. Exactly six paths change.

The source guard accepts the actual input before/after the command. The first
post-command empty-plan probe exposed stale fixture-only `main` metadata; after
advancing only that isolated clone's reference to its prepared local commit,
the real planner returnsfalse, matching the next-main-run boundary. This does
not weaken any production check. No remote ref, App token, package publication
or registry asset is created.

Local receipt is retained as
`notebook-single-pilot-20261117/core0135-full-recipe-receipt.json` in the operator
cache, binding the shared helper bytes and both fixture commits. This is local
whole-command evidence alongside Notebook's prior hosted recipe proof43987271519;
the genuine bot PR, current hosted CI/main, completion and scheduling remain
separate pilot acceptance gates.

## Workspace-only declarative recipe

An empty extra-file map is permitted only when a source-owned workspace policy
is present and the sole qualified script is exactly `changeset version &&
corepack pnpm@<qualified-version> install --lockfile-only`. The workspace policy
then supplies the real file binding; no artificial redundant file is required.
All existing installed CLI bytes, configuration, formatter, Node/package-manager,
lifecycle and development coordinate/digest checks remain mandatory. Direct
mode, custom helpers, extra scripts, missing/malformed policies and changed
workspace bytes still fail before writer admission or release-plan inspection.

Visual Delta exposed one exact failing regression for this source shape. The
new positive and negative case qualifies the bounded command, not arbitrary
empty-file recipes. No CI image, toolchain version or publication is changed.
