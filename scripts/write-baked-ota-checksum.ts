/**
 * Write dist/ota-checksum.txt after vite build so a fresh IPA can skip OTA
 * when the baked web already matches mobile-latest.json.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashDistOtaChecksum } from "./ota-bundle.ts";

const DIST = join(process.cwd(), "dist");
if (!existsSync(join(DIST, "index.html"))) {
  throw new Error("dist/index.html missing — build first");
}

const checksum = hashDistOtaChecksum(DIST);
writeFileSync(join(DIST, "ota-checksum.txt"), `${checksum}\n`);
console.log(`wrote dist/ota-checksum.txt ${checksum}`);
