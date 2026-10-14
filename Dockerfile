# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.15.0-bookworm@sha256:f22d6a1f082c02f292e86929b5b0442ac2e5eaf438a5dea9b1566601c3e05940
FROM ${NODE_IMAGE}

ARG PNPM_VERSION=10.34.5
ARG PLAYWRIGHT_VERSION=1.61.1
ARG MDBOOK_VERSION=0.5.4
ARG GH_VERSION=2.102.0
ARG GH_AMD64_SHA256=bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386
ARG GH_ARM64_SHA256=7862c86c72f43df3a2d93ddde6f473285b4e2af61b494849846827e513ef6484
ARG MDBOOK_AMD64_SHA256=3f28de05dafca9d0f2eab99c662116b0e37b89b1d96a08f8f430b9eeae958cd7
ARG MDBOOK_ARM64_SHA256=753e5c5c363ee8a56972344dcf91466f005a51db84a7aeffe427ae3ef83d6d44

LABEL org.opencontainers.image.title="Lapis CI" \
      org.opencontainers.image.description="Pinned LapisMD Node, pnpm, Playwright, Chromium, mdBook, and GitHub CLI toolchain" \
      org.opencontainers.image.source="https://github.com/lapismd/lapis-ci" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

ENV CI=true \
    DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/pnpm \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PATH=/pnpm:$PATH

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    xauth \
    xvfb \
    unzip \
    zip \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
  && pnpm config set store-dir /pnpm/store

RUN architecture="$(uname -m)" \
  && case "$architecture" in \
    x86_64) \
      mdbook_target="x86_64-unknown-linux-gnu"; \
      mdbook_sha256="$MDBOOK_AMD64_SHA256" \
      ;; \
    aarch64|arm64) \
      mdbook_target="aarch64-unknown-linux-musl"; \
      mdbook_sha256="$MDBOOK_ARM64_SHA256" \
      ;; \
    *) echo "Unsupported mdBook architecture: $architecture" >&2; exit 1 ;; \
  esac \
  && archive="mdbook-v${MDBOOK_VERSION}-${mdbook_target}.tar.gz" \
  && curl --fail --location --retry 3 \
    "https://github.com/rust-lang/mdBook/releases/download/v${MDBOOK_VERSION}/${archive}" \
    --output "/tmp/${archive}" \
  && echo "${mdbook_sha256}  /tmp/${archive}" | sha256sum --check --strict \
  && tar -xzf "/tmp/${archive}" -C /usr/local/bin mdbook \
  && rm "/tmp/${archive}" \
  && mdbook --version

RUN pnpm add --global "playwright@${PLAYWRIGHT_VERSION}" \
  && playwright install --with-deps chromium \
  && chmod -R a+rX /ms-playwright \
  && rm -rf /var/lib/apt/lists/*

RUN architecture="$(uname -m)" \
  && case "$architecture" in \
    x86_64) gh_target="linux_amd64"; gh_sha256="$GH_AMD64_SHA256" ;; \
    aarch64|arm64) gh_target="linux_arm64"; gh_sha256="$GH_ARM64_SHA256" ;; \
    *) echo "Unsupported GitHub CLI architecture: $architecture" >&2; exit 1 ;; \
  esac \
  && archive="gh_${GH_VERSION}_${gh_target}.tar.gz" \
  && curl --fail --location --retry 3 \
    "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${archive}" \
    --output "/tmp/${archive}" \
  && echo "${gh_sha256}  /tmp/${archive}" | sha256sum --check --strict \
  && tar -xzf "/tmp/${archive}" -C /tmp "gh_${GH_VERSION}_${gh_target}/bin/gh" \
  && install -m 0755 "/tmp/gh_${GH_VERSION}_${gh_target}/bin/gh" /usr/local/bin/gh \
  && rm -rf "/tmp/${archive}" "/tmp/gh_${GH_VERSION}_${gh_target}" \
  && gh --version

COPY versions.json /usr/local/share/lapis-ci/versions.json
COPY scripts/verify-image.mjs /usr/local/share/lapis-ci/verify-image.mjs

RUN node /usr/local/share/lapis-ci/verify-image.mjs

WORKDIR /workspace
