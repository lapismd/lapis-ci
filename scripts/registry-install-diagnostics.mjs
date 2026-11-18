// Diagnostic projection only. Retry decisions continue to consume unchanged raw bytes.
const code = (value) =>
  typeof value === "string" && /^[A-Z][A-Z0-9_]{0,127}$/.test(value)
    ? value
    : undefined;
const packageName = (value) =>
  typeof value === "string" &&
  value.length <= 214 &&
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)
    ? value
    : undefined;
const version = (value) =>
  typeof value === "string" &&
  value.length <= 128 &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(
    value,
  )
    ? value
    : undefined;
function safeUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href.length <= 1024 ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function project(event, stream) {
  const error = event.error ?? event.err ?? event;
  const errorCode = code(error.code);
  if (!errorCode) return undefined;
  const missing =
    /^No matching version found for ((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@([^ ]+)\.$/.exec(
      error.summary ?? "",
    );
  const pkg =
    error.package ??
    event.package ??
    (missing
      ? { name: missing[1], version: missing[2], bareSpecifier: missing[2] }
      : {});
  // Never render arbitrary messages, environment, headers, stack or local paths.
  return Object.fromEntries(
    Object.entries({
      stream,
      code: errorCode,
      packageName: packageName(pkg.name),
      version: version(pkg.version),
      bareSpecifier: version(pkg.bareSpecifier),
      url: safeUrl(
        error.request?.url ??
          error.url ??
          /https?:\/\/[^\s<>"']+/.exec(
            error.message ?? error.summary ?? "",
          )?.[0],
      ),
    }).filter(([, value]) => value !== undefined),
  );
}
export function installDiagnostics(stdout, stderr) {
  const terminalErrors = [];
  let omittedRecords = 0;
  const append = (record) => {
    if (!record) return;
    terminalErrors.push(record);
    if (terminalErrors.length > 4) {
      terminalErrors.shift();
      omittedRecords++;
    }
  };
  for (const [stream, text] of [
    ["stdout", stdout],
    ["stderr", stderr],
  ]) {
    for (const line of text.split("\n")) {
      if (Buffer.byteLength(line) > 65536) continue;
      try {
        const event = JSON.parse(line);
        if (event && (event.level === "error" || event.error || event.err))
          append(project(event, stream));
      } catch {
        const match = /^npm error code ([A-Z][A-Z0-9_]{0,127})\s*$/.exec(line);
        if (match) append({ stream, code: match[1] });
      }
    }
  }
  return { terminalErrors, omittedRecords };
}
export function withInstallDiagnostics(error, stdout, stderr) {
  // Keep the bounded JSON projection shallow: Node's default inspection would
  // otherwise collapse nested error records to [Object]. Originals remain
  // available to strict classifiers but absent from inspection/serialization.
  return Object.defineProperties(error, {
    diagnostics: {
      value: JSON.stringify(installDiagnostics(stdout, stderr)),
      enumerable: true,
    },
    stdout: { value: stdout },
    stderr: { value: stderr },
  });
}
