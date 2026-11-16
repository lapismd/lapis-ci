# Mira npm12 readiness profile

Mira's accepted release workflow installs npm12.0.2 and its clean verification
uses npm's default peer policy, disabled lifecycle scripts and an explicit
package lock. Tasks and Docs use strict peers. Shared readiness must preserve
these source-owned differences without downgrading the installed npm tool.

The explicit `npm12-default-peers` profile adds only initial installation with
`--ignore-scripts --strict-peer-deps=false --package-lock=true --json`.
Exact tool-version admission, install-v1 identity/SHA512 checks, finite owner
budgets, per-attempt fresh cache, owned process cleanup and typed exact-candidate
propagation classification are shared with the existing profiles. It grants no
upload, signing, audit, release or repository permission. Existing strict npm12,
strict/default npm11 and default pnpm10 profiles remain unchanged.

The exact `scripts/registry-npm12-default.test.mjs` regression first fails1/1
because the profile is missing, then passes. The real loopback fixture now
exercises both metadata lag and the actual initial-install ETARGET error under
default npm peers, in addition to the existing strict npm and pnpm cases. It
checks the installed exact version/integrity, fresh-cache cleanup and retry
phase/count; the npm root postinstall exits99 if scripts are incorrectly enabled.

The isolated official-archive checksum-bound npm12.0.2 qualification passes all
24 cases on Node24.15.0 and pnpm10.34.5. It leaves global npm unchanged, supplies
an empty user config and excludes signing/repository-write credentials.
The combined source after Docs qualification PR17 passes195 tests; formatting
and actionlint pass. No image or toolchain inputs change.

Mira adoption, its owner-selected installation budget, complete owning source
validation and real retained-artifact/provenance acceptance remain separate
work. This profile qualification is not a Mira publication or adoption receipt.
