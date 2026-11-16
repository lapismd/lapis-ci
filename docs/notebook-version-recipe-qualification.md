# Notebook version recipe qualification

The `notebook-changesets3` case binds the public, CI-qualified Notebook source
`64d5f7b7e21e6e9d98a821898f9c1411a620d391`. It executes the unchanged Node
command `node scripts/release.mjs version` with Changesets 3.0.3 and pnpm
10.32.1. The command synchronizes the root package, runtime manifest and
canonical version marker, then refreshes the lockfile with `--ignore-pnpmfile`.
It imports the source-owned release-candidate helper; neither helper is replaced.
Owner validation remains Docker-based. The version command itself uses Node.

The exact current source tuple binds 22 files: package and runtime manifests,
lockfile, workspace policy, Changesets configuration, version workflow, both
release helpers, the empty maintenance note, all seven canonical source files
and all six private package manifests. The runtime identity remains
`lapis-notebook`, independently of the public npm package name. The absent
formatter policy is checked by the existing `unconfigured` guard. Strict peer
policy is unchanged, and no formatter or Deno runtime is installed.

The historical patch note from ancestor
`cb79a6a7d294f0f9c83deea7410296db5ecc4fcc` is restored only in the guarded
disposable hosted fixture. Its path and exact SHA-256 are recorded in
`version-recipe-cases.json`. It is historical validation input, not current
release intent. The expected counterfactual plan contains only the public root
package, 0.2.4 to 0.2.5. No consumer branch, version, tag or publication is
written by qualification.

Independent before/after checks require only the root and runtime manifest
versions and canonical version marker to change. The runtime identity and all
other manifest fields must remain identical. The lock graph, private manifests,
other canonical files, workflow and imported helper remain unchanged. The
changelog must include the prepared version, and the generic release checker
preserves historical entries and consumes the genuine fixture note. The empty
maintenance note may remain unchanged or be consumed; it cannot acquire release
intent. Unexpected tracked or untracked outputs fail qualification.

The focused output regression initially passed 22 tests and failed one missing
source-closure rejection. The repaired suite and existing Docs/Tasks output
checks pass 61 tests. Negative controls cover private package mutations, runtime
identity drift, dependency and lock mutations, helper/configuration changes,
canonical evidence changes, unexpected outputs and unreviewed tooling or plans.
These local checks do not prove the complete hosted command. After this shared
change reaches main, run `qualify-version-recipe.yml` with
`case=notebook-changesets3`, inspect the immutable artifact and receipt, and only
then adopt the pinned guard in Notebook. Final owner CI and actual main
no-release-intent behavior remain separate acceptance requirements.

Full source `pnpm verify` passes 259 tests on Node 24.15.0; formatting and
actionlint pass. This slice changes no image or toolchain input.
