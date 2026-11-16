# Terminal native recipe qualification

Status: source-qualified locally; actual hosted whole-recipe proof pending.

Local `pnpm verify` passes225 controls, including all36 focused Terminal/AI
native controls. Formatter and actionlint pass. No image inputs changed.

The manual main-only `Qualify actual portable version recipe` workflow exposes
`terminal-changesets2-native`. It selects the immutable Terminal source
`6808f839e59279cec601f5b998d695ae29ad4963` and restores only the exact genuine
`.changeset/ordered-terminal-output.md` from ancestor
`2a0091e715e51c7ffb35a334cb533a91a08a9410`, in the existing guarded disposable
hosted fixture. This is labelled historical validation input, not current
release intent. It creates no release PR, package publication or tag.

## Inputs and native boundary

`version-recipe-cases.json` binds24 source/lock/config/manifest inputs,
including the unchanged seven-file recipe closure, pnpm10.32.1, the stock
Changesets2.31.1 bytes and exact Changesets config. The source command remains
`node scripts/changeset-version.mjs`; `release:check` and `dev:cargo` retain
their actual source commands.

The explicit profile requires Linux x64, official Node24.15.0 executable bytes,
Rust/cargo1.99.0 executable bytes and host identity, four owned Cargo members,
four Cargo build jobs and at least20GiB free. Official archive coordinates and
checksums accompany executable hashes. Node's archive was independently checked
against its official SHASUMS256.txt. Existing Rust archive evidence and actual
installed executable hashes agree. Unknown profiles, tools and commands reject.

No GitHub, npm or App credential enters the native fixture. Its filtered
environment discards injected Node options and unrelated credentials. Frozen
pnpm install preserves Terminal's lifecycle policy and ignores pnpm hooks.
The unchanged source workflow bootstrap runs `pnpm release:check` and locked
Cargo fetch. The actual version recipe then performs its own offline fetch,
Changesets mutation, coordinated metadata sync, offline Cargo update, offline
lockfile-only pnpm install, release check and formatter. Deno is absent from
the restricted executable path before and after. Failure remains terminal.

## Independent outputs

The verifier checks the public npm package plus both private package versions,
Tauri config, all four local Cargo lock records, workspace version and internal
crate ranges. Public and demo changelogs must change to the prepared version.
The canonical release chapter may replace only its prepared-version marker;
SUMMARY may append only the new release link. The new metadata-only release
record must match its reviewed exact hash. Every other canonical file retains
its input hash. Unexpected changed/untracked outputs reject; version preparation
cannot fabricate functional/native acceptance. The genuine pending note must
be consumed by the unchanged common proof runner.

## Source regression and remaining gate

The exact selection regression initially failed1/1 because Terminal had no
reviewed case, then passed1/1. Terminal controls cover substitutions, missing
credentials isolation, native tool drift/disk bounds, partial npm/Cargo/Tauri
updates, changelog drift, unrelated canonical edits, fabricated release evidence
and unreviewed files. Existing AI native/environment/output controls continue to
run against the extracted shared helpers; its Node22 policy is unchanged.

After normal source CI and merge, dispatch this exact case on shared main and
inspect its retained receipt. Only an actual successful whole-recipe run can
qualify Terminal's consumer guard adoption. Terminal source and version workflow
are not changed by this shared-source slice. Native session/browser correctness
and publication remain separate owner gates; no new runtime or image release is
claimed here.
