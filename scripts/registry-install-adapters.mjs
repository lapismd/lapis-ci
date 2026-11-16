import {
  runInstallCommand,
  registryFailure,
} from "./registry-install-process.mjs";

const profiles = {
  "npm12-strict-peers": {
    manager: "npm",
    major: 12,
    args: ["install", "--ignore-scripts", "--strict-peer-deps", "--json"],
  },
  "npm-strict-peers": {
    manager: "npm",
    major: 11,
    args: ["install", "--ignore-scripts", "--strict-peer-deps", "--json"],
  },
  "npm-default-peers": {
    manager: "npm",
    major: 11,
    args: ["install", "--ignore-scripts", "--json"],
  },
  "pnpm-default-peers": {
    manager: "pnpm",
    major: 10,
    args: ["install", "--strict-peer-dependencies=false", "--reporter=ndjson"],
  },
};
export function candidatePending(error, manager, entries) {
  if (
    error?.code !== "REGISTRY_INSTALL_FAILED" ||
    error.signal ||
    error.exitCode !== 1
  )
    return false;
  if (manager === "npm") {
    try {
      const data = JSON.parse(error.stdout);
      const extraCodes = [
        ...error.stderr.matchAll(/^npm error code (\S+)$/gm),
      ].map((m) => m[1]);
      return (
        data.error?.code === "ETARGET" &&
        extraCodes.every((c) => c === "ETARGET") &&
        entries.some(
          (e) =>
            data.error.summary ===
            `No matching version found for ${e.name}@${e.version}.`,
        )
      );
    } catch {
      return false;
    }
  }
  if (manager !== "pnpm") return false;
  const events = [];
  for (const line of (error.stdout + "\n" + error.stderr)
    .split("\n")
    .filter(Boolean)) {
    try {
      const entry = JSON.parse(line);
      if (entry.level === "error") events.push(entry);
    } catch {
      return false;
    }
  }
  return (
    events.length > 0 &&
    events.every(
      (event) =>
        event.name === "pnpm" &&
        event.code === "ERR_PNPM_NO_MATCHING_VERSION" &&
        entries.some(
          (e) =>
            event.package?.name === e.name &&
            event.package.version === e.version &&
            event.package.bareSpecifier === e.version,
        ),
    )
  );
}

/** Explicit source-owned peer policy and tool pin; no install fallback or audit waiver. */
export function registryInstaller(profile, toolVersion) {
  const selected = profiles[profile];
  if (
    !selected ||
    !new RegExp(`^${selected.major}\\.\\d+\\.\\d+$`).test(toolVersion)
  )
    throw registryFailure(
      "REGISTRY_INSTALL_PROFILE",
      "Select a supported profile and exact package-manager version",
    );
  return {
    pending: (error, entries) =>
      candidatePending(error, selected.manager, entries),
    async run({ cwd, cacheDir, timeoutMs, registry }) {
      const deadline = performance.now() + timeoutMs;
      const remaining = () =>
        Math.max(1, Math.floor(deadline - performance.now()));
      const result = await runInstallCommand(selected.manager, ["--version"], {
        cwd,
        timeoutMs: Math.min(5000, remaining()),
      });
      if (result.stdout.trim() !== toolVersion)
        throw registryFailure(
          "REGISTRY_INSTALL_TOOL",
          "Package-manager version drifted",
        );
      if (performance.now() >= deadline)
        throw registryFailure(
          "REGISTRY_INSTALL_TIMEOUT",
          "Tool inspection consumed the deadline",
        );
      return runInstallCommand(
        selected.manager,
        [
          ...selected.args,
          selected.manager === "npm" ? "--cache" : "--cache-dir",
          cacheDir,
          "--registry",
          registry,
        ],
        { cwd, timeoutMs: remaining() },
      );
    },
  };
}
