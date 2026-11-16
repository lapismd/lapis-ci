import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  registryFailure as failure,
  assertInstallPlatform,
} from "./registry-install-process.mjs";
export { registryInstaller } from "./registry-install-adapters.mjs";

export const INSTALL_METADATA_ACCEPT =
  "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*";
const transient = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);
function validate(entries, registry, policy, installer) {
  const url = new URL(registry);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw failure(
      "REGISTRY_INPUT",
      "Registry must be a credential-free HTTPS endpoint or explicit loopback fixture",
    );
  if (
    !Array.isArray(entries) ||
    !entries.length ||
    entries.length > 100 ||
    entries.some((e) => !e || typeof e !== "object" || Array.isArray(e)) ||
    new Set(entries.map((e) => e.name)).size !== entries.length ||
    entries.some(
      (e) =>
        !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(
          e.name ?? "",
        ) ||
        !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(e.version ?? "") ||
        !/^sha512-[A-Za-z0-9+/]{86}==$/.test(e.integrity ?? ""),
    )
  )
    throw failure(
      "REGISTRY_INPUT",
      "Require unique exact stable package/version/SHA512 identities",
    );
  if (
    !Number.isSafeInteger(policy?.budgetMs) ||
    policy.budgetMs < 1 ||
    policy.budgetMs > 600000 ||
    !Array.isArray(policy.delaysMs) ||
    policy.delaysMs.length > 60 ||
    policy.delaysMs.some(
      (ms) => !Number.isSafeInteger(ms) || ms < 1 || ms > policy.budgetMs,
    ) ||
    typeof installer?.run !== "function" ||
    typeof installer.pending !== "function"
  )
    throw failure(
      "REGISTRY_INPUT",
      "Select a finite owner-reviewed deadline, delays and installer",
    );
}
async function metadataReady(entry, registry, fetcher, remaining) {
  const signal = AbortSignal.timeout(Math.max(1, Math.min(5000, remaining())));
  let response,
    bytes = 0;
  try {
    response = await fetcher(
      `${registry.replace(/\/$/, "")}/${entry.name.replace("/", "%2F")}`,
      {
        headers: { Accept: INSTALL_METADATA_ACCEPT },
        cache: "no-store",
        redirect: "error",
        signal,
      },
    );
  } catch (error) {
    throw failure(
      "REGISTRY_METADATA_TRANSPORT",
      "Installation metadata request failed",
      {
        retryable:
          signal.aborted || transient.has(error?.cause?.code ?? error?.code),
      },
    );
  }
  if ([404, 429, 500, 502, 503, 504].includes(response.status)) {
    const header = response.headers.get("Retry-After");
    const retryAfterMs = /^\d+$/.test(header ?? "")
      ? Number(header) * 1000
      : /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
            header ?? "",
          )
        ? Math.max(0, Date.parse(header) - Date.now())
        : 0;
    await response.body?.cancel();
    throw failure("REGISTRY_METADATA_PENDING", `HTTP ${response.status}`, {
      retryable: true,
      retryAfterMs: Number.isNaN(retryAfterMs) ? 0 : retryAfterMs,
    });
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw failure("REGISTRY_METADATA_HTTP", `HTTP ${response.status}`);
  }
  let data;
  try {
    const chunks = [];
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024)
        throw failure(
          "REGISTRY_METADATA_LIMIT",
          "Install metadata exceeded4MiB",
        );
      chunks.push(chunk);
    }
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error.code === "REGISTRY_METADATA_LIMIT") throw error;
    throw failure(
      "REGISTRY_METADATA_INVALID",
      "Invalid installation metadata",
      {
        retryable:
          signal.aborted || transient.has(error?.cause?.code ?? error?.code),
      },
    );
  }
  if (
    data?.name !== entry.name ||
    !data.versions ||
    typeof data.versions !== "object" ||
    Array.isArray(data.versions)
  )
    throw failure(
      "REGISTRY_METADATA_IDENTITY",
      "Installation metadata identity mismatch",
    );
  const version = data.versions[entry.version];
  if (!version)
    throw failure(
      "REGISTRY_VERSION_PENDING",
      "Exact version absent from installation metadata",
      { retryable: true },
    );
  if (
    version.name !== entry.name ||
    version.version !== entry.version ||
    version.dist?.integrity !== entry.integrity
  )
    throw failure(
      "REGISTRY_METADATA_INTEGRITY",
      "Installation name/version/integrity mismatch",
    );
}

/** The caller owns trusted registry and independently verified publication identities. */
export async function installPublishedConsumer({
  cwd,
  entries,
  registry,
  policy,
  installer,
  fetcher = fetch,
  wait = sleep,
  now = () => performance.now(),
  report = (event) => console.log(JSON.stringify(event)),
}) {
  assertInstallPlatform();
  validate(entries, registry, policy, installer);
  entries = entries.map((entry) => Object.freeze({ ...entry }));
  policy = { ...policy, delaysMs: [...policy.delaysMs] };
  const started = now(),
    deadline = started + policy.budgetMs;
  const remaining = () => Math.max(0, Math.floor(deadline - now()));
  const attempts = policy.delaysMs.length + 1;
  const candidates = entries.map((e) => `${e.name}@${e.version}`);
  const deadlineAt = new Date(Date.now() + policy.budgetMs).toISOString();
  const notify = (phase, attempt, extra = {}) =>
    report({
      timestamp: new Date().toISOString(),
      deadlineAt,
      phase,
      attempt,
      attempts,
      candidates,
      elapsedMs: Math.floor(now() - started),
      budgetMs: policy.budgetMs,
      ...extra,
    });
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let phase = "metadata",
      cacheDir;
    const cleanup = async () => {
      if (cacheDir) {
        await rm(cacheDir, { recursive: true, force: true });
        cacheDir = undefined;
      }
    };
    try {
      notify(phase, attempt);
      for (const entry of entries) {
        if (!remaining())
          throw failure(
            "REGISTRY_READINESS_EXHAUSTED",
            "No metadata budget remains",
          );
        await metadataReady(entry, registry, fetcher, remaining);
      }
      if (!remaining())
        throw failure(
          "REGISTRY_READINESS_EXHAUSTED",
          "No installation budget remains",
        );
      phase = "install";
      notify(phase, attempt);
      cacheDir = await mkdtemp(path.join(cwd, ".registry-metadata-"));
      await installer.run({ cwd, cacheDir, timeoutMs: remaining(), registry });
      await cleanup();
      if (!remaining())
        throw failure(
          "REGISTRY_READINESS_EXHAUSTED",
          "Installation exceeded the deadline",
        );
      notify("ready", attempt);
      return;
    } catch (error) {
      await cleanup();
      const retryable =
        error.retryable === true || installer.pending(error, entries);
      const configured = policy.delaysMs[attempt - 1];
      const delayMs =
        configured === undefined
          ? undefined
          : Math.max(configured, error.retryAfterMs ?? 0);
      if (
        !remaining() ||
        (retryable && (delayMs === undefined || delayMs >= remaining()))
      ) {
        notify("exhausted", attempt, { failedPhase: phase, cause: error.code });
        throw failure(
          "REGISTRY_READINESS_EXHAUSTED",
          "Readiness deadline or attempt budget exhausted",
          { cause: error },
        );
      }
      if (!retryable) {
        notify("failed", attempt, { failedPhase: phase, cause: error.code });
        throw error;
      }
      notify("pending", attempt, {
        failedPhase: phase,
        cause: error.code,
        delayMs,
      });
      await wait(delayMs);
    } finally {
      await cleanup();
    }
  }
}
