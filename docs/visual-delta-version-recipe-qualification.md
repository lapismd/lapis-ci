# Visual Delta Corepack version qualification

The explicit `visual-delta-changesets3-corepack` case retains the source-owned
command `changeset version && corepack pnpm@10.32.1 install --lockfile-only`.
It does not replace Corepack with a simpler pnpm command or add a formatter.
The source is the public, CI-qualified tooling candidate
`1d8056458f19c33ba541c64ab78f1b12adc0aaa2`; the case binds its root manifest,
lockfile, Changesets config, workspace policy, release workflow and empty
maintenance note by SHA-256.

The historical patch note from ancestor
`48f2f67da74ac6959bc4f59d1095f654a22de9af` is restored only by the existing
guarded disposable hosted fixture. Its exact path and bytes are recorded in
`version-recipe-cases.json`. It is labelled historical validation input, not
current release intent. The expected counterfactual mutation is the single
public root package 0.1.5 to 0.1.6; neither source nor registry is versioned.

Before mutation, the Linux x64 profile verifies official Node 24.15.0 executable
bytes, the complete stock Corepack 0.34.6 JavaScript/package inventory, actual
Corepack version and pnpm 10.32.1. Only this profile adds that verified Corepack
executable to the restricted PATH. Deno remains absent. The environment retains
the existing read-only workflow token for genuine GitHub changelog reads and
does not inherit writer, publish or Node injection settings. The native AI and
Terminal profiles remain separate and credential-free.

The opt-in `formatterPolicy: "unconfigured"` runtime guard binds the absence of
standard Prettier config/ignore files, EditorConfig and a manifest `prettier`
field through the source's lookup ancestry. Any new declaration, including a
dangling config symlink, requires source requalification before writer authority.
Existing consumers without this field retain their current policy. The guard
does not install a formatter or broaden its existing Deno boundary. Corepack
executable checks belong to the whole-recipe proof; the input guard alone does
not claim to verify arbitrary transitive tooling or execute the recipe.

After the actual command, independent checks require the exact single-package
plan, only the root version changing in its manifest, a new changelog entry with
historical entries unchanged, and consumption of the reviewed genuine and empty
notes. Unexpected tracked/untracked paths fail. Lock, config, workspace, release
workflow and every canonical chapter remain byte-identical. The source input
guard and executable checks run again. No writer App, remote branch, signing,
tagging or publication participates.

Local regression evidence starts with one failing case-selection test and one
failing absent-formatter policy test. Their repaired targets and drift tests
pass, including changed command/tool/runtime/source bindings, extra Corepack
code, dependency mutation, lock/canonical/changelog changes and unexpected
outputs. Hosted whole-recipe evidence remains required after this shared change
reaches main; selection and unit tests are not a substitute for that proof or
for the consumer's final-head functional CI.

The full source `pnpm verify` passes 234 tests on Node 24.15.0; actionlint and
formatting pass. Actual local stock-tool inspection accepts all nine Corepack
code/package files. Read-only input acceptance also passes for Plugins, Core,
Mira, Tasks, Docs, Agent UI and Terminal on Node 24.15.0 and AI on verified
official Node 22.23.5. These checks execute no consumer version command and
introduce no adoption or publication claim.

## First hosted result and fixture correction

Actual run `43976382266` at shared source
`a462cf8fc9efdaa2f07c52b248c851db02013524` passes immutable source/runtime
checks, the frozen install, real status and the unchanged version command.
The final output check rejects ten untracked files. The harness creates its
nine restricted-PATH entries and status file under the consumer's `.local/`
directory; unlike earlier consumers, Visual Delta does not ignore that path.
This is a failed qualification, not successful whole-recipe acceptance.

Qualification metadata now lives in an owned temporary sibling outside consumer
source, with cleanup on success and failure. A temporary root inside the
consumer is rejected. The consumer's ignore policy, exact version command,
zero-unexpected-output assertion and every other output guard remain unchanged.
The new regression proves that a consumer without any local-directory ignore
stays unchanged while proof metadata is created and removed. Existing negative
output tests continue rejecting arbitrary tracked and untracked paths.
The focused fixture/output suite passes nine tests and full source verification
passes 236 tests. A new exact-source hosted run remains required after merge.
