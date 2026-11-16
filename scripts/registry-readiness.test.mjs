import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  candidatePending,
  registryInstaller,
} from "./registry-install-adapters.mjs";
import {
  registryFailure,
  assertInstallPlatform,
} from "./registry-install-process.mjs";
const helpers = await import("./registry-readiness.mjs").catch(() => ({}));
const entry = {
  name: "@lapismd/readiness-fixture",
  version: "1.0.0",
  integrity: "sha512-" + Buffer.alloc(64, 7).toString("base64"),
};
const ready = () =>
  Response.json({
    name: entry.name,
    versions: {
      [entry.version]: { ...entry, dist: { integrity: entry.integrity } },
    },
  });
async function fixture(t) {
  const cwd = await mkdtemp(path.join(tmpdir(), "registry-ready-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let time = 0;
  const events = [],
    caches = [],
    waits = [];
  return {
    cwd,
    events,
    caches,
    waits,
    advance: (ms) => {
      time += ms;
    },
    options: {
      cwd,
      entries: [entry],
      registry: "https://registry.npmjs.org",
      policy: { budgetMs: 110000, delaysMs: [5000, 10000] },
      now: () => time,
      wait: async (ms) => {
        waits.push(ms);
        time += ms;
      },
      report: (event) => events.push(event),
      fetcher: async () => ready(),
      installer: {
        pending: () => false,
        run: async ({ cacheDir, timeoutMs }) => {
          assert(timeoutMs > 0);
          await access(cacheDir);
          caches.push(cacheDir);
        },
      },
    },
  };
}

test("shared readiness verifies abbreviated metadata before installing exact published bytes", async (t) => {
  assert.equal(typeof helpers.installPublishedConsumer, "function");
  const f = await fixture(t);
  f.options.report = (event) => {
    f.events.push(event);
    if (event.phase === "ready")
      assert(
        f.caches.every((cache) => !existsSync(cache)),
        "ready must follow completed cache cleanup",
      );
  };
  f.options.fetcher = async (url, init) => {
    assert.equal(
      url,
      "https://registry.npmjs.org/@lapismd%2Freadiness-fixture",
    );
    assert.match(init.headers.Accept, /install-v1/);
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    return ready();
  };
  await helpers.installPublishedConsumer(f.options);
  assert.deepEqual(
    f.events.map((e) => e.phase),
    ["metadata", "install", "ready"],
  );
  assert.equal(f.caches.length, 1);
  assert.deepEqual(await readdir(f.cwd), []);
});

test("missing abbreviated versions wait before starting installation", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  f.options.fetcher = async () =>
    ++calls === 1 ? Response.json({ name: entry.name, versions: {} }) : ready();
  await helpers.installPublishedConsumer(f.options);
  assert.equal(calls, 2);
  assert.deepEqual(f.waits, [5000]);
  assert.equal(f.caches.length, 1);
});
test("identity, integrity, permissions, invalid JSON and oversized bodies stop immediately", async (t) => {
  for (const response of [
    Response.json({ name: "wrong", versions: {} }),
    Response.json({
      name: entry.name,
      versions: { [entry.version]: { ...entry, dist: { integrity: "wrong" } } },
    }),
    new Response(null, { status: 403 }),
    new Response("bad JSON"),
    new Response(" ".repeat(4 * 1024 * 1024 + 1)),
  ]) {
    const f = await fixture(t);
    f.options.fetcher = async () => response;
    await assert.rejects(helpers.installPublishedConsumer(f.options));
    assert.deepEqual(f.waits, []);
    assert.deepEqual(f.caches, []);
  }
});
test("owner deadlines include requests, sleeps and late successful installations", async (t) => {
  const f = await fixture(t);
  f.options.fetcher = async () => {
    f.advance(110000);
    return ready();
  };
  await assert.rejects(helpers.installPublishedConsumer(f.options), {
    code: "REGISTRY_READINESS_EXHAUSTED",
  });
  assert.deepEqual(f.caches, []);
  const late = await fixture(t);
  late.options.installer.run = async () => late.advance(110000);
  await assert.rejects(helpers.installPublishedConsumer(late.options), {
    code: "REGISTRY_READINESS_EXHAUSTED",
  });
  assert.deepEqual(await readdir(late.cwd), []);
  const wake = await fixture(t);
  wake.options.fetcher = async () => new Response(null, { status: 503 });
  wake.options.wait = async () => wake.advance(110000);
  await assert.rejects(helpers.installPublishedConsumer(wake.options), {
    code: "REGISTRY_READINESS_EXHAUSTED",
  });
  assert.deepEqual(wake.caches, []);
});
test("exact npm candidate ETARGET retries with a fresh removed cache", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  f.options.installer.pending = (error, entries) =>
    candidatePending(error, "npm", entries);
  f.options.installer.run = async ({ cacheDir }) => {
    await access(cacheDir);
    f.caches.push(cacheDir);
    if (++calls === 1)
      throw registryFailure("REGISTRY_INSTALL_FAILED", "npm failed", {
        exitCode: 1,
        stdout: JSON.stringify({
          error: {
            code: "ETARGET",
            summary: `No matching version found for ${entry.name}@${entry.version}.`,
          },
        }),
        stderr: "npm error code ETARGET\n",
      });
    await assert.rejects(access(f.caches[0]), { code: "ENOENT" });
  };
  await helpers.installPublishedConsumer(f.options);
  assert.equal(calls, 2);
  assert.notEqual(...f.caches);
  assert.deepEqual(await readdir(f.cwd), []);
});
test("permanent install failures keep their original error and are never retried", async (t) => {
  for (const code of ["ERESOLVE", "EINTEGRITY", "E401", "ELIFECYCLE"]) {
    const f = await fixture(t),
      error = registryFailure("REGISTRY_INSTALL_FAILED", "failed", {
        exitCode: 1,
        stdout: JSON.stringify({ error: { code } }),
        stderr: "",
      });
    f.options.installer.pending = (e) => candidatePending(e, "npm", [entry]);
    f.options.installer.run = async () => {
      throw error;
    };
    await assert.rejects(
      helpers.installPublishedConsumer(f.options),
      (e) => e === error,
    );
    assert.deepEqual(f.waits, []);
    assert.deepEqual(await readdir(f.cwd), []);
  }
});
test("typed npm classification rejects unrelated versions, packages, extra errors and unstructured output", () => {
  const good = {
    code: "REGISTRY_INSTALL_FAILED",
    exitCode: 1,
    signal: null,
    stdout: JSON.stringify({
      error: {
        code: "ETARGET",
        summary: `No matching version found for ${entry.name}@${entry.version}.`,
      },
    }),
    stderr: "npm error code ETARGET\n",
  };
  assert(candidatePending(good, "npm", [entry]));
  for (const bad of [
    { ...good, stdout: good.stdout.replace("1.0.0", "1.0.1") },
    { ...good, stdout: good.stdout.replace(entry.name, "unrelated") },
    { ...good, stderr: good.stderr + "npm error code ERESOLVE\n" },
    { ...good, stdout: "ETARGET" },
    { ...good, exitCode: null, signal: "SIGTERM" },
  ])
    assert(!candidatePending(bad, "npm", [entry]));
});
test("typed pnpm classification requires every error to identify the exact candidate", () => {
  const event = {
    level: "error",
    name: "pnpm",
    code: "ERR_PNPM_NO_MATCHING_VERSION",
    package: {
      name: entry.name,
      version: entry.version,
      bareSpecifier: entry.version,
    },
  };
  const error = (stdout) => ({
    code: "REGISTRY_INSTALL_FAILED",
    exitCode: 1,
    stdout,
    stderr: "",
  });
  assert(candidatePending(error(JSON.stringify(event)), "pnpm", [entry]));
  for (const text of [
    JSON.stringify({ ...event, code: "ERR_PNPM_PEER_DEP_ISSUES" }),
    JSON.stringify({
      ...event,
      package: { ...event.package, bareSpecifier: "^1.0.0" },
    }),
    JSON.stringify(event) + "\nunknown",
    JSON.stringify(event) +
      "\n" +
      JSON.stringify({ level: "error", code: "other" }),
  ])
    assert(!candidatePending(error(text), "pnpm", [entry]));
});
test("invalid policies, identities, credential-bearing registries and tool majors fail closed", async (t) => {
  const f = await fixture(t);
  for (const changed of [
    { policy: { budgetMs: Infinity, delaysMs: [] } },
    { entries: [{ ...entry, version: "latest" }] },
    { entries: [entry, entry] },
    { registry: "https://secret@registry.npmjs.org" },
    { registry: "http://example.com" },
  ])
    await assert.rejects(
      helpers.installPublishedConsumer({ ...f.options, ...changed }),
    );
  assert.throws(() => registryInstaller("npm-strict-peers", "12.0.0"));
  assert.throws(() => registryInstaller("unknown", "11.12.1"));
  assert.throws(() => assertInstallPlatform("win32"));
});
test("transient metadata retries honor Retry-After and cannot bypass longer cooldowns", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  f.options.fetcher = async () =>
    ++calls === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "12" } })
      : ready();
  await helpers.installPublishedConsumer(f.options);
  assert.deepEqual(f.waits, [12000]);
  const held = await fixture(t);
  held.options.fetcher = async () =>
    new Response(null, { status: 429, headers: { "Retry-After": "3600" } });
  await assert.rejects(helpers.installPublishedConsumer(held.options), {
    code: "REGISTRY_READINESS_EXHAUSTED",
  });
  assert.deepEqual(held.waits, []);
});
