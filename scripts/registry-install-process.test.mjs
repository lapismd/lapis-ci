import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  chmod,
  readFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runInstallCommand } from "./registry-install-process.mjs";

async function fakeManager(t, program) {
  const cwd = await mkdtemp(path.join(tmpdir(), "registry-process-")),
    bin = path.join(cwd, "bin");
  await mkdir(bin);
  const executable = path.join(bin, "npm");
  await writeFile(executable, `#!${process.execPath}\n${program}\n`);
  await chmod(executable, 0o755);
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return {
    cwd,
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
  };
}
function running(pid) {
  try {
    return !/^\s*Z/.test(
      execFileSync("ps", ["-o", "stat=", "-p", String(pid)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return false;
  }
}
test("the owned runner refuses publication, arbitrary programs and invalid arguments", () => {
  for (const [command, args] of [
    ["npm", ["publish"]],
    ["pnpm", ["exec", "sh"]],
    ["sh", ["install"]],
    ["npm", ["install", null]],
  ])
    assert.throws(
      () =>
        runInstallCommand(command, args, { cwd: tmpdir(), timeoutMs: 1000 }),
      { code: "REGISTRY_INSTALL_INPUT" },
    );
});
test("real install timeout kills the owned parent and descendant before returning", async (t) => {
  const f = await fakeManager(
    t,
    `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('child.pid',String(child.pid));setInterval(()=>{},1000);`,
  );
  await assert.rejects(
    runInstallCommand("npm", ["install"], { ...f, timeoutMs: 1000 }),
    { code: "REGISTRY_INSTALL_TIMEOUT" },
  );
  const pid = Number(await readFile(path.join(f.cwd, "child.pid"), "utf8"));
  assert(!running(pid));
});
test("an installer exiting early does not leave its owned background process alive", async (t) => {
  const f = await fakeManager(
    t,
    `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('child.pid',String(child.pid));child.unref();`,
  );
  await runInstallCommand("npm", ["install"], { ...f, timeoutMs: 5000 });
  const pid = Number(await readFile(path.join(f.cwd, "child.pid"), "utf8"));
  assert(!running(pid));
});
test("real output bounds terminate the owned installer instead of collecting unbounded diagnostics", async (t) => {
  const f = await fakeManager(
    t,
    `setInterval(()=>process.stdout.write('x'.repeat(65536)),0);`,
  );
  await assert.rejects(
    runInstallCommand("npm", ["install"], { ...f, timeoutMs: 5000 }),
    { code: "REGISTRY_INSTALL_OUTPUT_LIMIT" },
  );
});
