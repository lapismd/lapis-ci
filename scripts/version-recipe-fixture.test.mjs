import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { establishFixtureBaseline } from "./version-recipe-fixture.mjs";
import { restoreHistoricalFixtureNote } from "./version-recipe-fixture.mjs";
import { createHash } from "node:crypto";

async function fixture(t) {
  const workspace = await mkdtemp(path.join(tmpdir(), "lapis-recipe-ref-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const root = path.join(workspace, "consumer"),
    git = path.join(root, ".git");
  await mkdir(path.join(git, "refs/heads"), { recursive: true });
  const sourceGit = execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
    encoding: "utf8",
  }).trim();
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  // Only public object data; never copy checkout credential configuration.
  await cp(path.join(sourceGit, "objects"), path.join(git, "objects"), {
    recursive: true,
  });
  await writeFile(path.join(git, "HEAD"), sourceSha + "\n");
  await mkdir(path.join(root, ".changeset"));
  await writeFile(
    path.join(root, ".changeset/config.json"),
    '{"baseBranch":"main"}\n',
  );
  await writeFile(
    path.join(root, ".changeset/genuine.md"),
    "source-bytes-must-remain-unchanged\n",
  );
  const context = {
    actions: "true",
    repository: "lapismd/lapis-ci",
    workflow: "Qualify actual portable version recipe",
    ref: "refs/heads/main",
    workspace,
  };
  const read = (args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  return { workspace, root, git, sourceSha, context, read };
}

test("detached fixture main is bound to its exact selected HEAD before Changesets status", async (t) => {
  const f = await fixture(t);
  const before = spawnSync(
    "git",
    ["-C", f.root, "merge-base", "main", "HEAD"],
    { encoding: "utf8" },
  );
  assert.notEqual(
    before.status,
    0,
    "The original missing-main fixture boundary must reproduce",
  );
  const files = [".changeset/config.json", ".changeset/genuine.md"],
    bytes = await Promise.all(
      files.map((file) => readFile(path.join(f.root, file), "utf8")),
    );
  assert.deepEqual(
    await establishFixtureBaseline(f.root, f.sourceSha, f.context),
    { sourceSha: f.sourceSha, created: true },
  );
  assert.equal(f.read(["merge-base", "main", "HEAD"]), f.sourceSha);
  assert.equal(f.read(["rev-parse", "HEAD"]), f.sourceSha);
  assert.equal(
    spawnSync("git", ["-C", f.root, "symbolic-ref", "--quiet", "HEAD"]).status,
    1,
    "HEAD stays detached",
  );
  assert.deepEqual(
    await Promise.all(
      files.map((file) => readFile(path.join(f.root, file), "utf8")),
    ),
    bytes,
  );
  assert.deepEqual(
    await establishFixtureBaseline(f.root, f.sourceSha, f.context),
    { sourceSha: f.sourceSha, created: false },
  );
});

test("fixture ref setup rejects non-hosted or misplaced user checkout contexts", async (t) => {
  const f = await fixture(t);
  for (const context of [
    { ...f.context, actions: "false" },
    { ...f.context, repository: "other/repo" },
    { ...f.context, workflow: "CI" },
    { ...f.context, ref: "refs/heads/feature" },
    { ...f.context, workspace: f.root },
  ])
    await assert.rejects(
      establishFixtureBaseline(f.root, f.sourceSha, context),
      /known disposable/,
    );
  await assert.rejects(
    establishFixtureBaseline(process.cwd(), f.sourceSha, f.context),
    /known disposable/,
  );
  assert.equal(
    spawnSync("git", [
      "-C",
      f.root,
      "show-ref",
      "--verify",
      "--quiet",
      "refs/heads/main",
    ]).status,
    1,
  );
});

test("wrong immutable source, attached HEAD and conflicting baseline never overwrite refs", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    establishFixtureBaseline(f.root, "f".repeat(40), f.context),
    /selected immutable/,
  );
  await writeFile(path.join(f.git, "refs/heads/work"), f.sourceSha + "\n");
  await writeFile(path.join(f.git, "HEAD"), "ref: refs/heads/work\n");
  await assert.rejects(
    establishFixtureBaseline(f.root, f.sourceSha, f.context),
    /detached/,
  );
  await writeFile(path.join(f.git, "HEAD"), f.sourceSha + "\n");
  await writeFile(path.join(f.git, "refs/heads/main"), "f".repeat(40) + "\n");
  await assert.rejects(
    establishFixtureBaseline(f.root, f.sourceSha, f.context),
    /baseline/,
  );
  assert.equal(
    await readFile(path.join(f.git, "refs/heads/main"), "utf8"),
    "f".repeat(40) + "\n",
  );
});

test("production fixture setup precedes unchanged install/status and whole-recipe commands", async () => {
  const source = await readFile(
    new URL("./qualify-version-recipe.mjs", import.meta.url),
    "utf8",
  );
  const baseline = source.indexOf("await establishFixtureBaseline(");
  assert(baseline > source.indexOf('readGit(["rev-parse", "HEAD"])'));
  assert(baseline < source.indexOf('run(["install"'));
  assert(baseline < source.indexOf('run(["exec", "changeset", "status"'));
  assert.match(source, /run\(\["release:version"\],\s*env\)/);
});

test("current-tuple validation restores only exact historical note bytes in the fenced fixture", async (t) => {
  const f = await fixture(t);
  const git = (args, input) =>
    execFileSync("git", ["-C", f.root, ...args], {
      input,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid",
        GIT_COMMITTER_NAME: "Fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      },
    }).trim();
  const bytes =
    '---\n"genuine-package": minor\n---\n\nHistorical source note.\n';
  const blob = git(["hash-object", "-w", "--stdin"], bytes);
  const notes = git(["mktree"], `100644 blob ${blob}\trestored.md\n`);
  const tree = git(["mktree"], `040000 tree ${notes}\t.changeset\n`);
  const historical = git(["commit-tree", tree], "Historical pending source\n");
  const empty = git(["mktree"], "");
  const current = git(
    ["commit-tree", empty, "-p", historical],
    "Current source without the consumed note\n",
  );
  await writeFile(path.join(f.git, "HEAD"), current + "\n");
  const note = {
    sourceSha: historical,
    path: ".changeset/restored.md",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  await assert.rejects(
    restoreHistoricalFixtureNote(
      f.root,
      current,
      { ...note, sha256: "0".repeat(64) },
      f.context,
    ),
    /hash/,
  );
  await assert.rejects(
    restoreHistoricalFixtureNote(
      f.root,
      current,
      { ...note, path: "../escape.md" },
      f.context,
    ),
    /note path/,
  );
  await assert.rejects(
    restoreHistoricalFixtureNote(f.root, current, note, {
      ...f.context,
      actions: "false",
    }),
    /known disposable/,
  );
  await assert.rejects(
    restoreHistoricalFixtureNote(
      f.root,
      current,
      { ...note, sourceSha: f.sourceSha },
      f.context,
    ),
    /immutable ancestor/,
  );
  await writeFile(path.join(f.git, "HEAD"), historical + "\n");
  await assert.rejects(
    restoreHistoricalFixtureNote(f.root, historical, note, f.context),
    /already owns/,
  );
  await writeFile(path.join(f.git, "HEAD"), current + "\n");
  const result = await restoreHistoricalFixtureNote(
    f.root,
    current,
    note,
    f.context,
  );
  assert.equal(await readFile(path.join(f.root, note.path), "utf8"), bytes);
  assert.equal(result.kind, "historical-validation-input");
  assert.equal(result.currentReleaseIntent, false);
  assert.equal(f.read(["rev-parse", "HEAD"]), current);
  await assert.rejects(
    restoreHistoricalFixtureNote(f.root, current, note, f.context),
    /EEXIST/,
  );
});
