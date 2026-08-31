/**
 * Shared OTA file list + checksum so the IPA's baked hash matches Capgo's.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const OTA_SKIP_DIRS = new Set(["downloads"]);
export const OTA_SKIP_FILES = new Set([
  "desktop-latest.json",
  "desktop-config.json",
  "mobile-latest.json",
  "ota-checksum.txt",
]);

function collectOtaRelativeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store") continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      out.push(...collectOtaRelativeFiles(abs, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/** Full web bundle except desktop downloads and OTA metadata. */
export function listOtaBundleFiles(dist: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dist)) {
    if (OTA_SKIP_DIRS.has(name) || name === ".DS_Store") continue;
    const abs = join(dist, name);
    if (statSync(abs).isDirectory()) {
      files.push(...collectOtaRelativeFiles(abs, name));
    } else if (!OTA_SKIP_FILES.has(name)) {
      files.push(name);
    }
  }
  return files.sort();
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function manifestChecksum(
  entries: { file_name: string; file_hash: string }[],
): string {
  const body = entries
    .map((entry) => `${entry.file_name}\t${entry.file_hash}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(body).digest("hex");
}

export function hashDistOtaChecksum(dist: string): string {
  const entries = listOtaBundleFiles(dist).map((rel) => ({
    file_name: rel,
    file_hash: sha256File(join(dist, rel)),
  }));
  return manifestChecksum(entries);
}
