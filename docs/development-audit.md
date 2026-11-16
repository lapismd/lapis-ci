# Exact temporary development audit admission

`actions/check-development-audit` runs complete raw full and production pnpm
audits on the caller's already frozen-installed root graph. Node24 and the exact
declared pnpm version are required. It installs nothing, reads no credentials,
mints no token and changes no source or policy. Consumers pin the reviewed
source and supply only a source-owned policy path and an ephemeral report path.
This helper is separate from version-runtime qualification and image contents.

## Bound policy

The default policy has no acceptance:

```json
{
  "schemaVersion": 1,
  "repository": "lapismd/example",
  "approvals": []
}
```

At most one approval can cover one LOW, stable package version, exact advisory
and dependency path, under `scope: development-only`. It must bind the reviewed
dependency-source commit, raw manifest SHA256 and raw lock SHA256, exact
vulnerable/unfixed metadata, approved/expires timestamps, authority and a
source-owned Markdown decision record. Authority distinguishes a delegated
operator decision from explicit user approval; it does not infer permission or
transfer another repository's exception. The record must exist in this source.
Unknown fields, scopes, broad paths, severities or durations over seven days fail.

`sourceSha` means the latest commit touching `package.json`, `pnpm-lock.yaml` or
`pnpm-workspace.yaml`; it does not purport to approve every product-source byte.
Read-only Git checks require a repository-root context and no uncommitted graph
changes, including untracked or ignored dependency configuration. This avoids self-reference when the later reviewed policy commit adds
only data/docs. Manifest repository identity and actual package-manager version
must agree with the caller. Unsafe/symlink-escaped source files fail. After audit
and registry collection, the runner revalidates the clean graph, dependency
source, manifest, lockfile, policy and decision-record bytes. Approval expiry
is checked at that final decision time; collection cannot extend its lifetime.

## Every other finding remains fatal

- Both commands must return complete legacy pnpm JSON, consistent per-severity
  counts and matching exit codes; muted, suppressed, failed or unavailable
  evidence cannot qualify.
- Production must have no findings at any severity. The approved path's first
  hop must be a declared root development dependency; a direct production,
  optional or peer exposure of that hop or affected package blocks admission.
- Each full finding must match the sole approval and every source/graph/time
  binding. Additional paths, versions, findings, changed metadata or expired/
  future approval block. No package-wide or severity-wide ignore is emitted.
- Fix metadata comes only from the official public npm registry and is never
  serialized into a report. An available patched range or any newer stable
  package release ends acceptance immediately for review, conservatively even
  before advisory metadata identifies the successor as a fix.
- A clean graph applies no exception and reports any valid old entry as retired,
  without needing stale fix metadata. Source owners remove that inactive entry;
  changed graph/source bindings prevent it reviving on a later reintroduction.

This is a bounded dependency-graph guard, not arbitrary source, build-output or
workflow security analysis. Existing functional/browser/axe/package and source
ownership gates remain necessary. It grants no merge, release or deployment
authority and does not allow development tooling risk to become runtime risk.

## Evidence and first real validation

The decision records `rawFullExitCode`, `rawProductionExitCode`, unchanged raw
counts, exact accepted identity/expiry/authority and retired entries. Only
successfully parsed raw audit JSON is retained separately; arbitrary command
errors, registry bodies and credentials are not printed or saved. Callers retain
these ephemeral artifacts independently of public site/document generation.

The new core regression first failed because its module did not exist. Ten
focused cases now cover positive exact admission, changed identity/path/source/
manifest/lock, expiry/future approval, successor/fix metadata, production
exposure, extra/muted/incomplete evidence, strict schema, actual subprocess
command shapes and stale retirement. Node24 full source qualification passes69
tests, formatter and actionlint; image/tool versions are unchanged.

The actual Docs candidate removed24 of25 advisories and passed all69 units,
13 fresh browser/axe cases, package check/build/publint and cold static Storybook.
Its remaining raw LOW is deepmerge4.3.1 under the declared Svelte development
plugin; production audit is clean. The actual new entrypoint, using freshly
read committed dependency source `c5f1aac305d47e667d9fd6f38f4c5a8236dafe22`,
returned temporary development acceptance with raw full exit1/count1 and
production exit0/count0. Its exact policy is a new delegated operator decision
under the standing user delegation, expiring2026-11-21T00:00:00Z or sooner on a
successor/fix; no earlier coordinator or Visual Delta approval is transferred.
That local proof does not deploy this helper: upstream source review/CI and
consumer pin/data integration remain separate required steps.

The root `--prod` audit does not replace a packed public peer-closure audit.
Docs' separate fresh consumer subsequently exposed an unrelated KaTeX finding
through the published Mira editor/Mermaid chain; that runtime finding remains
blocking and is not covered by this development decision. Consumers must retain
their complete artifact/peer acceptance and every other original source gate.

Review regressions reproduced two late-admission failures before the fix: a
source/policy mutation during evidence collection and expiry crossed during a
registry read. Both now reject while retaining the raw audits. The complete
Node24 source suite passes72 tests; no image or toolchain input changed.

A separate regression reproduces untracked graph admission before the repair;
initial and late status checks now reject untracked or ignored graph inputs.
