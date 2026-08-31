/**
 * Copy Tauri bundle outputs into public/downloads/ with stable filenames for the site.
 * Run after: npm run desktop:build && npm run desktop:build:windows
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "downloads");

const MAC_CANDIDATES = [
  path.join(ROOT, "src-tauri/target/release/bundle/dmg"),
  path.join(ROOT, "src-tauri/target/aarch64-apple-darwin/release/bundle/dmg"),
];

const WIN_CANDIDATES = [
  path.join(
    ROOT,
    "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis",
  ),
];

function newestDmg(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const dmgs = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".dmg"))
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile());
  if (!dmgs.length) return null;
  dmgs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dmgs[0]!;
}

function newestExe(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const exes = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("-setup.exe") || f.endsWith("_setup.exe"))
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile());
  if (!exes.length) return null;
  exes.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return exes[0]!;
}

function copy(src: string, destName: string) {
  const dest = path.join(OUT_DIR, destName);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.copyFileSync(src, dest);
  const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  console.log(`${path.basename(src)} → public/downloads/${destName} (${mb} MB)`);
}

function findFirst(finder: (dir: string) => string | null, dirs: string[]) {
  for (const dir of dirs) {
    const hit = finder(dir);
    if (hit) return hit;
  }
  return null;
}

const mac = findFirst(newestDmg, MAC_CANDIDATES);
const win = findFirst(newestExe, WIN_CANDIDATES);

if (!mac && !win) {
  console.error("No desktop bundles found. Build first:");
  console.error("  npm run desktop:build");
  console.error("  npm run desktop:build:windows");
  process.exit(1);
}

if (mac) copy(mac, "blinkywink-mac.dmg");
else console.warn("Skip Mac - no .dmg found");

if (win) copy(win, "blinkywink-windows-setup.exe");
else console.warn("Skip Windows - no NSIS .exe found");

console.log("\nPublish with desktop:publish — site buttons use GitHub Releases, not /downloads.");
