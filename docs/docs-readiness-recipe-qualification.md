# Docs readiness recipe qualification

Status: source-qualified locally; actual hosted whole-recipe proof pending.

Docs draft PR19 has immutable source
`3dc72ab588327c130aff99e39c832b53f2f72675`. Its release script now imports a
source-owned installation-readiness helper, so the historical recipe receipt
cannot qualify this new three-file closure. The `docs-readiness-changesets3`
case binds the actual source and all15 reviewed input hashes, CLI3.0.3,
pnpm10.32.1, strict frozen installation and the unchanged custom command
`node scripts/release.mjs version`.

The main-only disposable hosted fixture restores only the authentic historical
`.changeset/docs-supported-host-cohort.md` from
`9e8e7ec23fc5d7f412f180e76ebcb3699a00cfed`, SHA256
`73146f3748d9ec807e59fc3c18fbe72b1e804c08ae5884cdeb147d4d8026cbc6`.
Its real type remains minor. The actual plan must prepare only Docs0.3.0→0.4.0
inside that fixture. This creates no source release intent: the current Docs
head contains only an empty maintenance note. No writer App is minted, and no
package, source commit, tag or release is published by qualification.

Tasks and Docs now share one reviewed plugin output verifier. Repository,
package manager, strict-peer policy, exact local helper set, single release plan
and every allowed metadata marker remain explicit per-repository contracts.
The existing Tasks entry points and receipt fields remain available; its patch
plan and complete negative controls stay unchanged. Other existing recipe cases
retain their old behavior.

The verifier snapshots and then checks the actual source command's outputs:
package and runtime JSON may change only their coordinated version; the parsed
lock graph must remain identical. All five Docs outputs must match the planned
version: runtime manifest, canonical release marker, validator package pin,
governance pin and README package status. The four text files may change only
the exact single version marker. Source helpers, workflow, audit policy and
other bound inputs must remain unchanged. Changelog preparation must appear;
maintenance notes may only remain unchanged or be consumed. Unreviewed modified
or untracked paths fail closed.

The new exact-source case regression first failed1/1 because the case was absent,
then passed. The combined Tasks/Docs case and output suite passes36 tests,
including all four missing text-marker controls, changed advisory authority,
changed public/runtime contracts, graph, helper closure, workflow, canonical
prose, README instructions, changelog and unexpected output paths. The full
shared repository verification passes192 tests. Formatting and actionlint pass.
These are source/unit checks, not an actual hosted recipe receipt.

After landing and qualifying this shared source on main, dispatch
`Qualify actual portable version recipe` with case
`docs-readiness-changesets3`. Read back the immutable run and artifact receipt:
exact source/input hashes, genuine historical-note provenance, single actual
release plan, all five before/after outputs, unchanged graph and allowed paths.
Only that real successful run can close Docs PR19's pending recipe gate. Final
Docs current-head CI and the separately scoped audit decision remain required.
