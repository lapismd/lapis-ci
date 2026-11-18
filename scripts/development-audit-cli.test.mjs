import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("source-distributed CLI executes through a package-manager symlink and blocks unavailable graph", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "lapis-audit-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = join(root, "audit.mjs");
  await symlink(
    fileURLToPath(new URL("./run-development-audit.mjs", import.meta.url)),
    link,
  );
  const child = spawnSync(process.execPath, [link], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_WORKSPACE: root,
      LAPIS_AUDIT_WORKING_DIRECTORY: ".",
      LAPIS_AUDIT_POLICY_FILE: "disabled.json",
      LAPIS_AUDIT_REPORT_DIRECTORY: "report",
      GITHUB_OUTPUT: "",
    },
  });
  assert.equal(child.status, 1, child.stderr);
  const decision = JSON.parse(child.stdout);
  assert.equal(decision.allowed, false);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "report/decision.json"), "utf8")),
    decision,
  );
  assert.equal(decision.reason, "source-audit-or-fix-evidence-unavailable");
});
