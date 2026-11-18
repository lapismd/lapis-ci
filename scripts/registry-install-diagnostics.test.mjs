import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";
import {
  installDiagnostics,
  withInstallDiagnostics,
} from "./registry-install-diagnostics.mjs";
import { candidatePending } from "./registry-install-adapters.mjs";

const candidate = { name: "@lapis-notes/api", version: "0.6.9" };
const event = {
  level: "error",
  name: "pnpm",
  code: "ERR_PNPM_NO_MATCHING_VERSION",
  package: { ...candidate, bareSpecifier: candidate.version },
};
const failure = (stdout, stderr = "") =>
  withInstallDiagnostics(
    Object.assign(new Error("Package-manager install failed"), {
      code: "REGISTRY_INSTALL_FAILED",
      exitCode: 1,
      signal: null,
    }),
    stdout,
    stderr,
  );

test("diagnostic projection cannot change exact candidate retry decisions", () => {
  const good = JSON.stringify(event);
  assert(candidatePending(failure(good), "pnpm", [candidate]));
  for (const text of [
    good + "\nunknown",
    JSON.stringify({ ...event, code: "ERR_PNPM_FETCH_404" }),
    JSON.stringify({ ...event, code: "ERR_PNPM_PEER_DEP_ISSUES" }),
    JSON.stringify({
      ...event,
      package: { ...event.package, version: "0.6.10" },
    }),
  ]) {
    assert(!candidatePending(failure(text), "pnpm", [candidate]));
  }
  const npm = JSON.stringify({
    error: {
      code: "ETARGET",
      summary: `No matching version found for ${candidate.name}@${candidate.version}.`,
    },
  });
  assert(
    candidatePending(failure(npm, "npm error code ETARGET\n"), "npm", [
      candidate,
    ]),
  );
  assert(
    !candidatePending(failure(npm, "npm error code E401\n"), "npm", [
      candidate,
    ]),
  );
});

test("npm exact missing-version summaries retain typed candidate coordinates", () => {
  const data = installDiagnostics(
    JSON.stringify({
      error: {
        code: "ETARGET",
        summary: `No matching version found for ${candidate.name}@${candidate.version}.`,
      },
    }),
    "",
  );
  assert.equal(data.terminalErrors[0].packageName, candidate.name);
  assert.equal(data.terminalErrors[0].version, candidate.version);
});

test("only bounded typed fields are visible; arbitrary text and auth material stay private", () => {
  const raw = JSON.stringify({
    ...event,
    message: "Bearer secret",
    prefix: "/private/secret",
    env: { TOKEN: "secret" },
    request: {
      url: "https://user:secret@registry.npmjs.org/@lapis-notes/api/-/api-0.6.9.tgz?token=secret#secret",
      headers: { authorization: "secret" },
    },
  });
  const error = failure(raw, "password=secret");
  const shown = inspect(error) + JSON.stringify(error);
  assert(!shown.includes("secret"));
  assert(!shown.includes("/private/"));
  assert(shown.includes("ERR_PNPM_NO_MATCHING_VERSION"));
  assert(
    shown.includes(
      "https://registry.npmjs.org/@lapis-notes/api/-/api-0.6.9.tgz",
    ),
  );
  assert.equal(error.stdout, raw);
  assert.equal(error.stderr, "password=secret");
  assert(!Object.keys(error).includes("stdout"));
});

test("last terminal errors survive huge progress and many earlier errors within a small projection", () => {
  const events = Array.from({ length: 100 }, (_, index) =>
    JSON.stringify({ ...event, code: `ERROR_${index}` }),
  );
  const data = installDiagnostics(
    JSON.stringify({ level: "debug", data: "x".repeat(100000) }) +
      "\n" +
      events.join("\n"),
    "",
  );
  assert.equal(data.terminalErrors.length, 4);
  assert.equal(data.omittedRecords, 96);
  assert.deepEqual(
    data.terminalErrors.map((x) => x.code),
    ["ERROR_96", "ERROR_97", "ERROR_98", "ERROR_99"],
  );
  assert(Buffer.byteLength(JSON.stringify(data)) <= 8192);
});

test("npm typed errors and nested pnpm errors retain their code without rendering message text", () => {
  const npm = installDiagnostics(
    JSON.stringify({
      error: {
        code: "E401",
        summary:
          "secret https://user:secret@registry.npmjs.org/@lapis-notes/api?token=secret",
      },
    }),
    "npm error code E401\n",
  );
  assert.equal(npm.terminalErrors[0].code, "E401");
  assert.equal(
    npm.terminalErrors[0].url,
    "https://registry.npmjs.org/@lapis-notes/api",
  );
  assert(!JSON.stringify(npm).includes("secret"));
  assert.equal(
    installDiagnostics(
      JSON.stringify({ level: "error", err: { code: "EINTEGRITY" } }),
      "",
    ).terminalErrors[0].code,
    "EINTEGRITY",
  );
});

test("malformed, oversized and unstructured records never expose raw fallback text", () => {
  const raw =
    "secret\n" +
    JSON.stringify({ level: "error", code: "bad secret", message: "secret" }) +
    "\n" +
    JSON.stringify({ ...event, message: "secret".repeat(20000) });
  assert.deepEqual(installDiagnostics(raw, "password=secret"), {
    terminalErrors: [],
    omittedRecords: 0,
  });
});
