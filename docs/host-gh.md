# Pinned GitHub CLI on host runners

The shared `actions/setup-gh` action owns host installation. Consumers pin the
reviewed action commit and retain their source-owned verification commands;
no consumer downloader, runtime workaround or new credential authority is added.

Linux AMD64/ARM64 keeps the existing version/archive pins, tar command and version
probe. Darwin supports ARM64 only. Its separate `gh-host-assets.json` binds the
same primary `versions.json` CLI version to the official macOS ARM64 ZIP and
extracted binary SHA256. Dockerfile, embedded image metadata and Linux tool
assets are unchanged; this is not an image-platform or tool-version release.

Darwin verifies bounded archive bytes before extracting only the exact `bin/gh`
member to an exclusively created file. It checks the binary digest and thin
Mach-O ARM64 header before execution, verifies the exact CLI version, and only
then adds its owned temporary directory to `GITHUB_PATH`. Unknown OS/architecture,
missing or mismatched metadata, malformed/big archives, wrong binary/header or
version remain failures; no mutable/latest fallback or authorization header is used.

## Qualification and adoption

The pins come from the official [CLI v2.102.0 release](https://github.com/cli/cli/releases/tag/v2.102.0)
and checksums. Linux can inspect those archive/binary bytes without executing
Mach-O. That inspection is not native Darwin qualification.

The CI `host-gh-darwin-arm64` job uses the documented
[`macos-15` ARM64 runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
asserts its actual OS/architecture, invokes this shared action and checks the
owned installation path, binary hash, version and attestation command ABI. Its
minimal public receipt is an Actions artifact, not committed operational data.
A green Linux unit test or a preinstalled host CLI cannot substitute for that
current source's complete native hosted result.

After source review and complete hosted qualification, a consumer may pin the
shared action and run its existing verifier on the same platform. Terminal's
actual verification and product gates remain separately owned and pending;
this source does not migrate its code or publish/sign packages. Rollback retains
the preceding reviewed action pin. An unsupported Darwin host stays held rather
than receiving a consumer bootstrap or Linux binary.
