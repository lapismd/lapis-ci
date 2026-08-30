# Remote Turbo cache

LapisMD CI uses the existing authenticated self-hosted Turbo cache. Task
artifacts are signed by the producing Turbo client and verified by consumers.
The cache improves execution time but is never the source of truth for build or
test correctness.

## Organization configuration

Create these GitHub Actions organization variables for `lapismd`:

- `TURBO_API`: the HTTPS cache API endpoint.
- `TURBO_TEAM`: `lapismd`, the shared namespace for LapisMD repositories.

Create these GitHub Actions organization secrets:

- `TURBO_TOKEN`: the authentication token configured on the cache server.
- `TURBO_REMOTE_CACHE_SIGNATURE_KEY`: a random value of at least 32 bytes used
  by Turbo for HMAC-SHA256 artifact integrity.

Use selected-repository access rather than organization-wide access. Add a
repository only when its workflow has adopted this contract. Never commit the
values or pass them as container build arguments.

The authentication token must match the server deployment. Rotate the server
token and the organization secret as one coordinated operation. The artifact
signature key is client-side; rotating it invalidates existing signed cache
artifacts and therefore causes safe cache misses.

## Consumer configuration

Pass the organization settings to jobs that invoke Turbo:

```yaml
env:
  TURBO_API: ${{ vars.TURBO_API }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_REMOTE_CACHE_SIGNATURE_KEY: >-
    ${{ secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY }}
```

Enable integrity verification and use bounded network timeouts in
`turbo.json`:

```json
{
  "remoteCache": {
    "signature": true,
    "timeout": 10,
    "uploadTimeout": 30
  },
  "futureFlags": {
    "longerSignatureKey": true
  }
}
```

Do not add `.turbo` to `actions/cache`. Independent jobs restore package
outputs from the same remote cache after running the normal frozen install.
Repository workflows should expose remote-cache hits in Turbo's normal logs.

GitHub does not pass Actions secrets to workflows triggered from forks. With no
token, Turbo runs tasks using its local cache and normal execution. A cache
timeout or an unavailable cache must likewise degrade to a warning and a cache
miss rather than skip validation.

## Local development

Remote caching is optional locally. Developers can set the same four values in
an ignored repository-root `.env` and use the repository's local CI wrapper to
pass them into the container. Without a complete configuration, the wrapper
must omit the remote credentials and retain only its local `.turbo` volume.

Before enabling a repository in CI, validate:

1. A cold task uploads a signed artifact.
2. A clean second checkout reports a remote cache hit.
3. A wrong signature key rejects the artifact and runs the task.
4. A missing token and an unavailable endpoint both run the task normally.
5. No workflow output, container history, artifact, or run summary contains a
   credential value.
