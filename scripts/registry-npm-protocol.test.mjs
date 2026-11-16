import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { installPublishedConsumer } from "./registry-readiness.mjs";
import { registryInstaller } from "./registry-install-adapters.mjs";

async function fixture(t, mode, manager) {
  const root = await mkdtemp(path.join(tmpdir(), "npm-propagation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source"),
    cwd = path.join(root, "consumer");
  await mkdir(path.join(source, "package"), { recursive: true });
  await mkdir(cwd);
  const name = `@lapismd/readiness-fixture-${randomBytes(6).toString("hex")}`,
    version = "1.0.0";
  await writeFile(
    path.join(source, "package/package.json"),
    JSON.stringify({ name, version, main: "index.js" }),
  );
  await writeFile(
    path.join(source, "package/index.js"),
    "module.exports = 'verified fixture';\n",
  );
  const packed = path.join(root, "fixture.tgz");
  execFileSync("tar", ["-czf", packed, "-C", source, "package"]);
  const tarball = await readFile(packed),
    integrity =
      "sha512-" + createHash("sha512").update(tarball).digest("base64");
  const entry = { name, version, integrity },
    events = [],
    requests = [];
  let probes = 0,
    installs = 0,
    installActive = false,
    registry;
  const server = createServer((req, res) => {
    requests.push({
      method: req.method,
      path: req.url,
      accept: req.headers.accept,
    });
    if (req.url === "/fixture.tgz") {
      res.end(tarball);
      return;
    }
    if (req.url.startsWith("/-/npm/v1/security/")) {
      res.setHeader("Content-Type", "application/json");
      res.end("{}");
      return;
    }
    if (
      decodeURIComponent(new URL(req.url, "http://localhost").pathname) !==
      "/" + name
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const probe = !installActive;
    if (probe) probes++;
    const stale =
      mode === "metadata" ? probe && probes === 1 : !probe && probes === 1;
    const selected = stale ? "0.9.0" : version;
    const metadata = {
      name,
      "dist-tags": { latest: selected },
      versions: {
        [selected]: {
          name,
          version: selected,
          main: "index.js",
          dist: { integrity, tarball: registry + "/fixture.tgz" },
        },
      },
    };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(metadata));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  registry = `http://127.0.0.1:${server.address().port}`;
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({
      name: "consumer",
      private: true,
      dependencies: { [name]: version },
      ...(manager === "npm"
        ? { scripts: { postinstall: 'node -e "process.exit(99)"' } }
        : {}),
    }),
  );
  const tool = execFileSync(manager, ["--version"], {
      encoding: "utf8",
    }).trim(),
    base = registryInstaller(
      manager === "npm" ? "npm-strict-peers" : "pnpm-default-peers",
      tool,
    );
  const installer = {
    pending: base.pending,
    run: async (input) => {
      installs++;
      installActive = true;
      try {
        return await base.run(input);
      } finally {
        installActive = false;
      }
    },
  };
  return {
    cwd,
    entry,
    events,
    requests,
    registry,
    installer,
    counts: () => ({ probes, installs }),
  };
}
test("real npm tool-version drift stops before installation", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "npm-version-drift-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const version = execFileSync("npm", ["--version"], { encoding: "utf8" })
    .trim()
    .split(".");
  version[2] = String(Number(version[2]) + 1);
  const installer = registryInstaller("npm-strict-peers", version.join("."));
  await assert.rejects(
    installer.run({
      cwd,
      cacheDir: cwd,
      timeoutMs: 5000,
      registry: "http://127.0.0.1:1",
    }),
    { code: "REGISTRY_INSTALL_TOOL" },
  );
});
for (const manager of ["npm", "pnpm"])
  for (const mode of ["metadata", "installation"])
    test(
      `real ${manager} handles ${mode} propagation with its source-owned peer/script policy`,
      { timeout: 40000 },
      async (t) => {
        const f = await fixture(t, mode, manager);
        await installPublishedConsumer({
          cwd: f.cwd,
          entries: [f.entry],
          registry: f.registry,
          installer: f.installer,
          policy: { budgetMs: 30000, delaysMs: [20, 20] },
          report: (e) => f.events.push(e),
        });
        const installed = JSON.parse(
          await readFile(
            path.join(f.cwd, "node_modules", f.entry.name, "package.json"),
            "utf8",
          ),
        );
        assert.equal(installed.name, f.entry.name);
        assert.equal(installed.version, f.entry.version);
        const lock = await readFile(
          path.join(
            f.cwd,
            manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml",
          ),
          "utf8",
        );
        if (manager === "npm")
          assert.equal(
            JSON.parse(lock).packages["node_modules/" + f.entry.name].integrity,
            f.entry.integrity,
          );
        else assert(lock.includes(f.entry.integrity));
        assert(f.events.some((e) => e.phase === "pending"));
        assert.equal(f.counts().installs, mode === "metadata" ? 1 : 2);
        assert(
          !(await readdir(f.cwd)).some((name) =>
            name.startsWith(".registry-metadata-"),
          ),
        );
        assert(
          f.requests
            .filter((r) => r.path === "/fixture.tgz")
            .every((r) => r.method === "GET"),
        );
      },
    );
