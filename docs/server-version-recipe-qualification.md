# Server private version recipe qualification

The reviewed `server-changesets3` case binds lapis-server source
`78a3fe6f84b008af6ef11242c352a33b146e2caa`, Changesets 3.0.3, pnpm 10.34.5
and its configured Prettier inputs. It executes the unchanged owner command:

```sh
pnpm release:version
```

The command runs Changesets, refreshes the lockfile and formats the root
manifest/changelog. It does not invoke Rust. The two genuine source Changesets
prepare the private root package from 2.3.0 to 2.4.0. They are validation inputs
in a disposable checkout; this proof creates no version PR, tag, image, npm
publication or writer App token.

The private-root contract requires the actual Changesets plan to match this
minor release. Both source notes must be consumed and the root manifest and
changelog must change. The manifest must remain private, with every field other
than its version unchanged. The npm lock graph, Cargo manifest/lock, formatter
configuration, GitHub release helper, release workflow and existing source-owned
KaTeX audit decision remain unchanged. Unexpected tracked or untracked outputs
fail qualification. This preserves the existing audit policy; it grants no new
advisory exception and makes no claim that the production audit has no findings.

The shared workflow has only `contents: read`. Its ordinary workflow token
provides GitHub changelog reads. The qualification sandbox omits Deno and proves
that Deno is unavailable before and after the real command. Source hashes,
before/after output receipts, actual release plan and publication/App flags are
saved in `reports/version-recipe-qualification.json`.

Run the hosted proof only after this shared source is merged:

```sh
gh workflow run qualify-version-recipe.yml --repo lapismd/lapis-ci \
  --ref main -f case=server-changesets3
```

Download the `server-changesets3-runtime-qualification` artifact and verify its
digest, exact source, input bindings, actual command, private output contract and
successful result. Hosted proof is pending at this source change. Guard adoption
in Server is a subsequent source-owned change, pinned to reviewed shared code.
It must guard before minting the version-PR App token and preserve the existing
no-Changeset GitHub release/tag path and image dispatch. This proof authorizes
neither npm/crate publication nor a new automation rollout phase.

Local regression evidence: selecting this genuine immutable Server case failed
once before support existed, then passed with the private-root contract. The
26 focused tests also reject dependency/audit-policy drift, altered source,
wrong plans, private-package changes and unexpected outputs. Full `pnpm verify`
passes all 285 tests and repository checks; Actionlint passes the manual proof
workflow. Source Changesets status independently reports the genuine private
2.3.0 to 2.4.0 plan. Hosted acceptance is recorded separately.
