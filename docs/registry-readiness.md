# Shared registry installation readiness

[Source qualification and remaining adoption](registry-readiness-qualification.md)
retain the exact regressions, real protocol tests and initial fixture failures.

This source helper owns bounded installation-metadata observation and clean
consumer-install retries. Publishers retain package selection, independently
verified artifact disposition, signature/provenance verification, peer policy,
publication authority and registry trust. It cannot upload packages or mint an
App token. Source qualification is separate from adoption and genuine hosted
publication proof.

The caller supplies exact stable package/version/SHA512 identities from its
verified candidate or, for an existing different-byte publication disposition,
the independently verified published package. A caller also selects an explicit
finite readiness budget and delay sequence. Notes'110-second window, Tasks'
295-second backoff, Docs' shorter window and Mira's350-second window remain
owner policy rather than a shared default.

Every request uses abbreviated install-v1 metadata, bypasses metadata caches,
rejects redirects, and checks exact name/version/integrity. One monotonic deadline
covers all requests, backoff and owned install processes. Missing versions and
recognized transient transport/service failures may retry; identity, integrity,
permission, malformed data, peer, script and unrelated dependency failures stop.

Each install attempt uses a new metadata cache. Fixed npm11, npm12 and pnpm10 profiles
retain their explicit strict/default peer and script policy. npm retries only
the exact candidate ETARGET from its structured JSON result; pnpm retries only
exact candidate ERR_PNPM_NO_MATCHING_VERSION NDJSON events. Other errors and
ambiguous output are terminal. The caller binds the exact tool version.
Server Retry-After cooldowns take precedence over the configured backoff and
cannot bypass the owner's absolute deadline. Metadata bodies are capped at4MiB;
combined process diagnostics at8MiB. Each report includes UTC time, deadline,
phase, exact candidate identities, attempt count and elapsed budget.

Failed installs expose a bounded JSON projection of the last four typed terminal
errors: code, package/version/exact specifier, and HTTP URL without credentials,
query or fragment. Arbitrary messages, headers, environment and local paths are
not rendered. The original bounded stdout/stderr remain non-enumerable inputs
to the unchanged strict classifier; diagnostic projection cannot admit retries.
The projection stays visible through default Node error inspection after large
progress output. [Qualification](registry-install-diagnostics-qualification.md)
keeps the actual Notes publication failure distinct from later controls.

## Source-pinned integration

Use `lapismd/lapis-ci/actions/setup-registry-readiness` at the reviewed immutable
40-character source commit. It exposes `LAPIS_REGISTRY_READINESS_MODULE` without
installing anything, requesting credentials or executing package operations.
The consumer imports `installPublishedConsumer` and `registryInstaller` from
that absolute module path using Node's `pathToFileURL`.

`installPublishedConsumer` requires `cwd`, `entries`, `registry`, `policy` and
`installer`. Entries carry exact `name`, `version` and SHA512 `integrity`.
The policy is `{budgetMs, delaysMs}`; no budget defaults are inherited. Create
the installer with `registryInstaller(profile, exactToolVersion)`:

| Profile              | Preserved install policy                                        |
| -------------------- | --------------------------------------------------------------- |
| `npm-strict-peers`   | npm11 install, ignore scripts, strict peers, structured JSON    |
| `npm12-strict-peers` | npm12 install, ignore scripts, strict peers, structured JSON    |
| `npm-default-peers`  | npm11 install, ignore scripts, default peers, structured JSON   |
| `pnpm-default-peers` | pnpm10 install, explicit strict-peer-dependencies=false, NDJSON |

The adapter verifies that exact tool version within the same remaining deadline.
It adds only the fresh cache and caller-owned registry coordinates. Successful
installation does not replace `npm ci`, signature/provenance, publint or source
acceptance. Any change to required peer/script semantics needs owning-source
review rather than selecting an easier profile.

Private release verification requires Linux or macOS process groups. Timeout and
output limits kill only the owned group and await its close before cache cleanup;
unsupported platforms fail closed. This restricts private CI execution, not the
published package's supported platforms.

Adoption order after shared hosted qualification: Tasks, Docs, Mira; Notes may
then replace its qualified local helper at an immutable shared source pin. Each
consumer retains frozen install/ci, publint, audit signatures, provenance,
source/native acceptance and existing-publication skip rules. No version is
manufactured to demonstrate recovery.

Mira's existing npm12.0.2 verifier uses the separately selected
`npm12-default-peers` profile. It keeps scripts disabled and a package lock,
explicitly preserves default peer behavior and shares the exact same bounded
metadata/process machinery. [Its qualification](mira-readiness-profile-qualification.md)
records24 isolated real-tool cases; it does not claim consumer adoption.
