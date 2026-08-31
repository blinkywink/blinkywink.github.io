/**
 * Write dist/ota-checksum.txt after vite build so a fresh IPA can skip OTA
 * when the baked web already matches the slim Capgo zip.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeSlimOtaZip } from "./ota-bundle.ts";

const DIST = join(process.cwd(), "dist");
const TMP_ZIP = join(process.cwd(), "android-artifacts", ".baked-ota.zip");
if (!existsSync(join(DIST, "index.html"))) {
  throw new Error("dist/index.html missing — build first");
}

mkdirSync(join(process.cwd(), "android-artifacts"), { recursive: true });
const checksum = writeSlimOtaZip(DIST, TMP_ZIP);
writeFileSync(join(DIST, "ota-checksum.txt"), `${checksum}\n`);
console.log(`wrote dist/ota-checksum.txt ${checksum}`);
