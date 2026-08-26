/**
 * Wipe local build outputs. Shipping is cloud-first — this just clears leftovers.
 *
 *   npm run clean
 *   npm run clean -- --deep   # also wipe src-tauri/target
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const deep = process.argv.includes("--deep");

const ALWAYS = [
  "dist",
  "dist-ssr",
  "ios-artifacts",
  "android-artifacts",
  "ios/App/build",
  "ios/App/App/public",
  "android/app/build",
  "android/build",
  "android/.gradle",
  "public/downloads/blinkywink-mac.dmg",
  "public/downloads/blinkywink-windows-setup.exe",
  "public/downloads/blinkywink-mac.app.tar.gz",
  "public/downloads/latest.json",
];

const DEEP = ["src-tauri/target"];

function wipe(rel: string) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) return;
  rmSync(full, { recursive: true, force: true });
  console.log(`removed ${rel}`);
}

for (const rel of ALWAYS) wipe(rel);
if (deep) {
  for (const rel of DEEP) wipe(rel);
} else {
  console.log("(skip src-tauri/target — pass --deep to wipe)");
}

console.log("Clean done.");
