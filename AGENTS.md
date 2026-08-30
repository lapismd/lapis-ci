# Lapis CI repository guidance

This repository owns the shared, deterministic CI toolchain image used by
LapisMD repositories. It does not own application source or package-specific
dependency layers.

## Image contract

- Pin every tool and base image to an exact version. Consumers must pin the
  published image by digest rather than use a mutable tag.
- Publish both `linux/amd64` and `linux/arm64` manifests from the same source
  commit.
- Keep package-manager dependencies out of the shared image. Consumer
  repositories may extend it with a lockfile-specific `pnpm fetch` layer.
- Never copy credentials, repository source, `node_modules`, or local caches
  into an image.
- The Playwright package and installed browser revision must remain aligned.

## Turbo remote cache contract

- Consumer repositories use the authenticated remote Turbo cache. Do not add
  an `actions/cache` upload for `.turbo` as a second cache authority.
- Keep `TURBO_TOKEN` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY` as restricted
  LapisMD organization secrets. Keep the API URL and team namespace as
  organization variables.
- Enable signed cache artifacts and require a signature key of at least 32
  bytes. Never print cache credentials or include them in an image layer.
- Fork pull requests and cache outages must fall back to normal task execution;
  cache availability is an optimization, not a correctness dependency.
- BuildKit's GitHub Actions cache is separate from Turbo task caching and may
  be used for constructing the shared container image.

## Validation and release

- Run `pnpm verify` and a native Docker build plus image smoke test before
  committing image changes.
- Treat the first public image publication and every toolchain version change
  as a manual release gate.
- Do not weaken the version or platform checks to make an image publish.
- Use Jujutsu for version control and commit each verified slice before push.
