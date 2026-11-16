import { spawn } from "node:child_process";

export function registryFailure(code, message, details = {}) {
  return Object.assign(new Error(`${code}: ${message}`), { code, ...details });
}
export function assertInstallPlatform(platform = process.platform) {
  if (!["linux", "darwin"].includes(platform))
    throw registryFailure(
      "REGISTRY_INSTALL_PLATFORM",
      "Owned process-group cancellation requires Linux or macOS",
    );
}

/** Start only a fixed package-manager command; never a shell or global process kill. */
export function runInstallCommand(
  command,
  args,
  { cwd, timeoutMs, env = process.env },
) {
  assertInstallPlatform();
  if (
    !["npm", "pnpm"].includes(command) ||
    !Array.isArray(args) ||
    !["install", "--version"].includes(args[0]) ||
    args.some((arg) => typeof arg !== "string" || arg.includes("\0")) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 600000
  )
    throw registryFailure(
      "REGISTRY_INSTALL_INPUT",
      "Invalid bounded install command",
    );
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      size = 0,
      stopped;
    const killOwned = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (cause) {
        if (cause.code !== "ESRCH") stopped = cause;
      }
    };
    const stop = (error) => {
      stopped ??= error;
      killOwned();
    };
    const timer = setTimeout(
      () =>
        stop(
          registryFailure(
            "REGISTRY_INSTALL_TIMEOUT",
            "Installation exhausted its remaining deadline",
          ),
        ),
      timeoutMs,
    );
    const collect = (stream) => (chunk) => {
      if (stopped) return;
      size += chunk.length;
      if (size > 8 * 1024 * 1024)
        return stop(
          registryFailure(
            "REGISTRY_INSTALL_OUTPUT_LIMIT",
            "Install diagnostics exceeded8MiB",
          ),
        );
      if (stream === "stdout") stdout += chunk.toString();
      else stderr += chunk.toString();
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    child.on("error", (error) => {
      stopped ??= error;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      killOwned();
      if (stopped) return reject(stopped);
      if (code === 0) return resolve({ stdout, stderr });
      reject(
        registryFailure(
          "REGISTRY_INSTALL_FAILED",
          "Package-manager install failed",
          { stdout, stderr, exitCode: code, signal },
        ),
      );
    });
  });
}
