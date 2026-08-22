/**
 * Write public/desktop-latest.json from signed Tauri updater artifacts.
 * Prefer: npm run desktop:publish  (also uploads the GitHub release)
 */
import fs from "node:fs";
import path from "node:path";
import {
  RELEASE_DOWNLOAD,
  readDesktopVersion,
  releaseTag,
} from "./desktop-version.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_JSON = path.join(ROOT, "public", "desktop-latest.json");

const MAC_DIRS = [
  path.join(ROOT, "src-tauri/target/release/bundle/macos"),
  path.join(ROOT, "src-tauri/target/aarch64-apple-darwin/release/bundle/macos"),
];

const WIN_DIRS = [
  path.join(ROOT, "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis"),
  path.join(ROOT, "src-tauri/target/release/bundle/nsis"),
];

type PlatformEntry = { signature: string; url: string };

function newestMatch(dirs: string[], test: (name: string) => boolean): string | null {
  const hits: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!test(name)) continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile()) hits.push(full);
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return hits[0]!;
}

function readSig(artifactPath: string): string {
  const sigPath = `${artifactPath}.sig`;
  if (!fs.existsSync(sigPath)) {
    throw new Error(`Missing signature: ${sigPath}`);
  }
  return fs.readFileSync(sigPath, "utf8").trim();
}

const version = readDesktopVersion();
const tag = releaseTag(version);

const macTar = newestMatch(
  MAC_DIRS,
  (name) => name.endsWith(".app.tar.gz") && !name.endsWith(".sig"),
);
const winExe = newestMatch(
  WIN_DIRS,
  (name) =>
    (name.endsWith("-setup.exe") || name.endsWith("_setup.exe")) &&
    !name.endsWith(".sig"),
);

const platforms: Record<string, PlatformEntry> = {};

if (macTar) {
  platforms["darwin-aarch64"] = {
    signature: readSig(macTar),
    url: `${RELEASE_DOWNLOAD}/${tag}/blinkywink-mac.app.tar.gz`,
  };
  console.log(`Mac updater: ${path.basename(macTar)}`);
} else {
  console.warn("Skip Mac — no .app.tar.gz found");
}

if (winExe) {
  platforms["windows-x86_64"] = {
    signature: readSig(winExe),
    url: `${RELEASE_DOWNLOAD}/${tag}/blinkywink-windows-setup.exe`,
  };
  console.log(`Windows updater: ${path.basename(winExe)}`);
} else {
  console.warn("Skip Windows — no NSIS .exe found");
}

if (!Object.keys(platforms).length) {
  console.error("No signed updater artifacts found. Build first with the signing key:");
  console.error("  npm run desktop:build");
  console.error("  npm run desktop:build:windows");
  process.exit(1);
}

const manifest = {
  version,
  notes: `Monkey Cards desktop ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nWrote ${path.relative(ROOT, OUT_JSON)} (version ${version})`);
console.log("Upload with: npm run desktop:publish");
