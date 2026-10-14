# Lapis CI

`lapismd/lapis-ci` defines the shared, deterministic Linux CI toolchain used by
LapisMD repositories. It provides Node, pnpm, Playwright with Chromium, mdBook, GitHub CLI,
and the browser/system utilities required by package and Storybook validation.

The shared image deliberately does not contain an application's source,
`node_modules`, credentials, or repository-specific dependencies. A consuming
repository may extend the image with a lockfile-specific `pnpm fetch` layer and
must still run a frozen install in its checked-out workspace.

## Pinned toolchain

| Tool | Version |
| --- | --- |
| Node | 24.15.0 |
| pnpm | 10.34.5 |
| Playwright and Chromium | 1.61.1 |
| mdBook | 0.5.4 |
| GitHub CLI | 2.102.0 |
| Platforms | `linux/amd64`, `linux/arm64` |

[`versions.json`](./versions.json) is the machine-readable source of truth.
The repository check fails when the Dockerfile or workflows drift from it.
GitHub CLI and mdBook downloads use architecture-specific SHA-256 checksums.
The image smoke test checks each tool's exact version. GitHub CLI supports
package release records and registry dispatch; authentication is supplied only
at job runtime.

## Local validation

```bash
pnpm verify
pnpm image:build
pnpm image:smoke
```

`pnpm image:build` targets the Docker host's native architecture. Use
`pnpm image:build:amd64` to match GitHub-hosted Linux runners or
`pnpm image:build:arm64` for an explicit Apple Silicon build, then run the
verifier against the matching candidate tag.

## Turbo remote cache

LapisMD repositories share task outputs through the authenticated remote cache
instead of uploading `.turbo` through GitHub Actions cache artifacts. The
shared image does not contain credentials or Turbo itself; each consumer uses
its pinned workspace Turbo version and receives cache configuration at runtime.

The organization-level contract is:

| GitHub setting | Kind | Purpose |
| --- | --- | --- |
| `TURBO_API` | Actions variable | Self-hosted cache API URL |
| `TURBO_TEAM` | Actions variable | Shared LapisMD cache namespace |
| `TURBO_TOKEN` | Actions secret | Cache-server authentication |
| `TURBO_REMOTE_CACHE_SIGNATURE_KEY` | Actions secret | HMAC integrity for uploaded artifacts |

Restrict both secrets to the selected LapisMD repositories that run Turbo.
Fork pull requests do not receive the secrets and must remain able to execute
all tasks normally without remote-cache access. See
[`docs/remote-turbo-cache.md`](./docs/remote-turbo-cache.md) for the consumer
configuration and rotation procedure.

## Publication

Publication is manual. Run the **Publish Lapis CI image** workflow with an
immutable calendar version such as `2026.08.1` and the approval phrase shown by
the workflow. The workflow publishes one multi-architecture manifest with an
SBOM and provenance attestation.

Consumers must use the reported digest:

```yaml
container:
  image: ghcr.io/lapismd/lapis-ci@sha256:<digest>
```

Do not consume `latest` or another mutable tag in CI.
