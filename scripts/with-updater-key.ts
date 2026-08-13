/**
 * Run a command with TAURI_SIGNING_* set from src-tauri/.updater-key.
 * Usage: tsx scripts/with-updater-key.ts tauri build --bundles dmg
 *
 * Sets CI=true so the Mac DMG bundler skips Finder AppleScript (no DMG window popup).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const keyPath = path.join(root, "src-tauri", ".updater-key");

if (!fs.existsSync(keyPath)) {
  console.error("Missing src-tauri/.updater-key (gitignored signing key).");
  console.error(
    'Generate one with: npx tauri signer generate -w src-tauri/.updater-key --ci --password ""',
  );
  console.error(
    "Then paste src-tauri/.updater-key.pub into plugins.updater.pubkey in src-tauri/tauri.conf.json.",
  );
  process.exit(1);
}

process.env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, "utf8");
process.env.TAURI_SIGNING_PRIVATE_KEY_PATH = keyPath;
process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";
// bundle_dmg.sh opens a Finder window unless CI=true (--skip-jenkins).
process.env.CI = "true";

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: tsx scripts/with-updater-key.ts <command> [args...]");
  process.exit(1);
}

const result = spawnSync(args[0]!, args.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
