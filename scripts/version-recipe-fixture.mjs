import { execFileSync, spawnSync } from "node:child_process";
import { lstat, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const hostedContext = () => ({
  actions: process.env.GITHUB_ACTIONS,
  repository: process.env.GITHUB_REPOSITORY,
  workflow: process.env.GITHUB_WORKFLOW,
  ref: process.env.GITHUB_REF,
  workspace: process.env.GITHUB_WORKSPACE,
});

async function requireDisposableFixture(
  root,
  sourceSha,
  context = hostedContext(),
) {
  const denied = () =>
    Error(
      "Baseline setup requires the known disposable hosted consumer checkout",
    );
  if (
    context.actions !== "true" ||
    context.repository !== "lapismd/lapis-ci" ||
    context.workflow !== "Qualify actual portable version recipe" ||
    context.ref !== "refs/heads/main" ||
    !context.workspace
  )
    throw denied();
  const workspace = await realpath(context.workspace),
    source = await realpath(root);
  if (source !== path.join(workspace, "consumer")) throw denied();
  const metadata = await lstat(path.join(source, ".git"));
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw denied();
  const run = (args) =>
    spawnSync("git", ["-C", source, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const read = (args) =>
    execFileSync("git", ["-C", source, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  if (
    (await realpath(
      path.resolve(source, read(["rev-parse", "--git-common-dir"])),
    )) !== (await realpath(path.join(source, ".git"))) ||
    (await realpath(read(["rev-parse", "--show-toplevel"]))) !== source
  )
    throw denied();
  if (
    !/^[a-f0-9]{40}$/.test(sourceSha ?? "") ||
    read(["rev-parse", "HEAD"]) !== sourceSha
  )
    throw Error("Fixture HEAD must match the selected immutable source");
  if (run(["symbolic-ref", "--quiet", "HEAD"]).status !== 1)
    throw Error("Fixture HEAD must stay detached before baseline setup");
  return { source, run, read };
}

/** Fixture-only Git metadata; never check out a branch or replace an existing ref. */
export async function establishFixtureBaseline(
  root,
  sourceSha,
  context = hostedContext(),
) {
  const { run, read } = await requireDisposableFixture(
    root,
    sourceSha,
    context,
  );
  const exists = run(["show-ref", "--verify", "--quiet", "refs/heads/main"]);
  let created = false;
  if (exists.status === 0) {
    if (read(["rev-parse", "refs/heads/main"]) !== sourceSha)
      throw Error(
        "Existing fixture baseline differs from the selected immutable source",
      );
  } else if (exists.status === 1) {
    // Compare-and-create only in this disposable checkout; a concurrent or
    // unexpected existing ref must never be moved, and no remote is updated.
    const result = run([
      "-c",
      "core.logAllRefUpdates=false",
      "update-ref",
      "refs/heads/main",
      sourceSha,
      "0".repeat(40),
    ]);
    if (result.status !== 0)
      throw Error(
        "Fixture baseline could not be created without replacing an existing ref",
      );
    created = true;
  } else throw Error("Fixture baseline could not be inspected safely");
  if (
    read(["rev-parse", "refs/heads/main"]) !== sourceSha ||
    read(["merge-base", "main", "HEAD"]) !== sourceSha ||
    read(["rev-parse", "HEAD"]) !== sourceSha
  )
    throw Error("Fixture baseline identity verification failed");
  return { sourceSha, created };
}

/** Restore genuine historical bytes only as explicitly labelled validation input. */
export async function restoreHistoricalFixtureNote(
  root,
  sourceSha,
  note,
  context = hostedContext(),
) {
  const { source, run } = await requireDisposableFixture(
    root,
    sourceSha,
    context,
  );
  if (
    !/^\.changeset\/[a-zA-Z0-9_-]+\.md$/.test(note.path ?? "") ||
    note.path === ".changeset/README.md"
  )
    throw Error("Historical validation requires a direct Changesets note path");
  if (
    !/^[a-f0-9]{40}$/.test(note.sourceSha ?? "") ||
    !/^[a-f0-9]{64}$/.test(note.sha256 ?? "") ||
    run(["merge-base", "--is-ancestor", note.sourceSha, sourceSha]).status !== 0
  )
    throw Error("Historical note source must be an immutable ancestor");
  const missing = run(["cat-file", "-e", `${sourceSha}:${note.path}`]);
  if (missing.status === 0)
    throw Error(
      "Selected source already owns the note; restoration is forbidden",
    );
  if (missing.status !== 128)
    throw Error("Historical note absence could not be established");
  const bytes = execFileSync(
    "git",
    ["-C", source, "show", `${note.sourceSha}:${note.path}`],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  if (createHash("sha256").update(bytes).digest("hex") !== note.sha256)
    throw Error("Historical note hash does not match reviewed source bytes");
  if (
    (await realpath(path.join(source, ".changeset"))) !==
    path.join(source, ".changeset")
  )
    throw Error("Historical note directory must stay inside its fixture");
  await writeFile(path.join(source, note.path), bytes, { flag: "wx" });
  return {
    kind: "historical-validation-input",
    currentReleaseIntent: false,
    ...note,
  };
}
