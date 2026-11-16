import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export function validateVersionOutputs(outputs) {
  if (!Array.isArray(outputs))
    throw Error("Version outputs must be reviewed source data");
  const paths = new Set();
  for (const item of outputs) {
    if (
      !item.path ||
      path.isAbsolute(item.path) ||
      item.path.split(/[\\/]/).some((s) => !s || s === "." || s === "..") ||
      paths.has(item.path)
    )
      throw Error(
        "Version output path must be unique and inside the source checkout",
      );
    paths.add(item.path);
    if (
      !item.packageName ||
      !["json-version", "text-marker"].includes(item.kind)
    )
      throw Error("Unknown version output contract");
    if (
      item.kind === "text-marker" &&
      (typeof item.marker !== "string" ||
        item.marker.split("{{version}}").length !== 2)
    )
      throw Error(
        "Version output marker requires exactly one version placeholder",
      );
  }
}

export async function verifyVersionOutputs(root, outputs, releases, phase) {
  validateVersionOutputs(outputs);
  assert(["before", "after"].includes(phase), "Unknown version output phase");
  const source = await realpath(root),
    receipts = [];
  for (const item of outputs) {
    const release = releases.find((r) => r.name === item.packageName);
    assert(release, "Every version output must belong to a prepared package");
    const version =
      phase === "before" ? release.oldVersion : release.newVersion;
    assert(
      /^\d+\.\d+\.\d+$/.test(version),
      "Version output requires an exact stable version",
    );
    const file = await realpath(path.join(source, item.path));
    assert(
      file.startsWith(source + path.sep),
      "Version output escapes its source checkout",
    );
    const bytes = await readFile(file);
    if (item.kind === "json-version")
      assert.equal(
        JSON.parse(bytes).version,
        version,
        "Runtime manifest version must match the package",
      );
    else
      assert(
        bytes.toString().includes(item.marker.replace("{{version}}", version)),
        "Canonical version marker must match the package",
      );
    receipts.push({
      path: item.path,
      packageName: item.packageName,
      version,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return receipts;
}
