/**
 * Build + publish the mobile web OTA zip + mobile-latest.json.
 *
 *   npx tsx scripts/publish-mobile-ota.ts
 *   npx tsx scripts/publish-mobile-ota.ts --raise-native-floor
 *   npx tsx scripts/publish-mobile-ota.ts --skip-build
 *
 * --raise-native-floor: set minNativeVersion to this app version (new APK/IPA).
 */
import { createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { REPO, readDesktopVersion } from "./desktop-version.ts";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const OUT_DIR = join(ROOT, "android-artifacts");
const ZIP_NAME = "MonkeyCards-web.zip";
const PUBLIC_JSON = join(ROOT, "public", "mobile-latest.json");
const raiseFloor = process.argv.includes("--raise-native-floor");
const skipBuild = process.argv.includes("--skip-build");

const MOBILE_TAG = "mobile";
const ZIP_URL = `https://github.com/${REPO}/releases/download/${MOBILE_TAG}/${ZIP_NAME}`;

function sh(cmd: string, cwd = ROOT) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function gh(args: string[]) {
  const result = spawnSync("gh", args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(`gh ${args.join(" ")} failed`);
}

function releaseExists(tag: string): boolean {
  const result = spawnSync(
    "gh",
    ["release", "view", tag, "--repo", REPO],
    { stdio: "pipe", env: process.env },
  );
  return result.status === 0;
}

function prevMinNative(version: string): string {
  if (existsSync(PUBLIC_JSON)) {
    try {
      const prev = JSON.parse(readFileSync(PUBLIC_JSON, "utf8")) as {
        minNativeVersion?: string;
      };
      const m = String(prev.minNativeVersion ?? "").trim();
      if (/^\d+\.\d+\.\d+$/.test(m)) return m;
    } catch {
      /* fall through */
    }
  }
  return version;
}

function fetchReleaseManifest(): {
  version?: string;
  minNativeVersion?: string;
  url?: string;
  checksum?: string;
  message?: string;
} | null {
  const result = spawnSync(
    "gh",
    [
      "release",
      "download",
      MOBILE_TAG,
      "--repo",
      REPO,
      "--pattern",
      "mobile-latest.json",
      "--dir",
      OUT_DIR,
      "--clobber",
    ],
    { stdio: "pipe", env: process.env },
  );
  if (result.status !== 0) return null;
  const path = join(OUT_DIR, "mobile-latest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as {
      version?: string;
      minNativeVersion?: string;
      url?: string;
      checksum?: string;
      message?: string;
    };
  } catch {
    return null;
  }
}

function ensureMobileRelease() {
  if (releaseExists(MOBILE_TAG)) return;
  gh([
    "release",
    "create",
    MOBILE_TAG,
    "--repo",
    REPO,
    "--title",
    "Monkey Cards mobile (sideload)",
    "--notes",
    "Rolling sideload builds + OTA web bundle.",
    "--latest=false",
  ]);
}

function writeManifest(manifest: {
  version: string;
  minNativeVersion: string;
  url: string;
  checksum: string;
  message: string;
}) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(PUBLIC_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  const stagedJson = join(OUT_DIR, "mobile-latest.json");
  copyFileSync(PUBLIC_JSON, stagedJson);
  return stagedJson;
}

const version = readDesktopVersion();

// APK/IPA jobs only raise the native floor — never rewrite the web zip
// (re-uploading the zip races with OTA and can 404 mid-clobber).
if (raiseFloor && skipBuild) {
  mkdirSync(OUT_DIR, { recursive: true });
  const fromRelease = fetchReleaseManifest();
  const fromPublic = existsSync(PUBLIC_JSON)
    ? (JSON.parse(readFileSync(PUBLIC_JSON, "utf8")) as {
        checksum?: string;
        url?: string;
      })
    : null;
  const checksum = String(fromRelease?.checksum ?? fromPublic?.checksum ?? "");
  const url = String(fromRelease?.url ?? fromPublic?.url ?? ZIP_URL);
  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new Error(
      "Cannot raise native floor: no checksum in release or public/mobile-latest.json",
    );
  }
  const stagedJson = writeManifest({
    version,
    minNativeVersion: version,
    url,
    checksum,
    message: "Sorry, you need to redownload the app to update.",
  });
  ensureMobileRelease();
  gh([
    "release",
    "upload",
    MOBILE_TAG,
    "--repo",
    REPO,
    "--clobber",
    stagedJson,
  ]);
  console.log(`\nRaised minNativeVersion → ${version} (zip unchanged)`);
  console.log(`  checksum: ${checksum}`);
  console.log(`  wrote ${PUBLIC_JSON}`);
  process.exit(0);
}

if (!skipBuild) {
  sh("npm run build");
}
if (!existsSync(join(DIST, "index.html"))) {
  throw new Error("dist/index.html missing — build first");
}

mkdirSync(OUT_DIR, { recursive: true });
const zipPath = join(OUT_DIR, ZIP_NAME);
rmSync(zipPath, { force: true });
sh(`zip -qr '${zipPath}' .`, DIST);

const checksum = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
const minNativeVersion = raiseFloor ? version : prevMinNative(version);

const stagedJson = writeManifest({
  version,
  minNativeVersion,
  url: ZIP_URL,
  checksum,
  message: "Sorry, you need to redownload the app to update.",
});

ensureMobileRelease();

gh([
  "release",
  "upload",
  MOBILE_TAG,
  "--repo",
  REPO,
  "--clobber",
  zipPath,
  stagedJson,
]);

console.log(`\nOTA published ${version}`);
console.log(`  zip: ${ZIP_URL}`);
console.log(`  minNativeVersion: ${minNativeVersion}`);
console.log(`  checksum: ${checksum}`);
console.log(`  wrote ${PUBLIC_JSON}`);
