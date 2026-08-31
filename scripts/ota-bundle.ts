/**
 * Slim Capgo zip (index.html + assets) so OTA is one ~2MB download.
 * Art and music load from monkeycards.pages.dev.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OTA_ZIP_SCRIPT = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "write-slim-ota-zip.py",
);

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** index.html + hashed JS/CSS only. Prints sha256 of the zip. */
export function writeSlimOtaZip(dist: string, outFile: string): string {
  const result = spawnSync("python3", [OTA_ZIP_SCRIPT, dist, outFile], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `slim OTA zip failed: ${result.stderr || result.stdout || result.status}`,
    );
  }
  const checksum = String(result.stdout ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error(`slim OTA zip did not print sha256: ${result.stdout}`);
  }
  return checksum;
}
