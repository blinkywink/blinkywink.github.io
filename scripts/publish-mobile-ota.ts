/**
 * Publish the mobile OTA zip + tiny mobile-latest.json.
 *
 *   npx tsx scripts/publish-mobile-ota.ts
 *   npx tsx scripts/publish-mobile-ota.ts --skip-build
 *
 * One ~2MB zip (JS/CSS). Art/music stay on Pages. Native floor is pinned.
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MIN_NATIVE_VERSION } from "../src/lib/mobileNativeVersion.ts";
import { readDesktopVersion, readMobileNativeVersion, REPO } from "./desktop-version.ts";
import { writeSlimOtaZip } from "./ota-bundle.ts";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const OUT_DIR = join(ROOT, "android-artifacts");
const PUBLIC_JSON = join(ROOT, "public", "mobile-latest.json");
const ZIP_NAME = "MonkeyCards-web.zip";
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

function ghJson(args: string[]): unknown {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`gh ${args.join(" ")} failed`);
  return JSON.parse(result.stdout || "null");
}

function releaseExists(tag: string): boolean {
  const result = spawnSync(
    "gh",
    ["release", "view", tag, "--repo", REPO],
    { stdio: "pipe", env: process.env },
  );
  return result.status === 0;
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

function pruneLegacyOtaFiles() {
  const data = ghJson([
    "release",
    "view",
    MOBILE_TAG,
    "--repo",
    REPO,
    "--json",
    "assets",
  ]) as { assets?: { name: string }[] };
  const stale = (data.assets ?? [])
    .map((asset) => asset.name)
    .filter((name) => name.startsWith("ota__"));
  if (!stale.length) return;
  console.log(`Pruning ${stale.length} legacy per-file OTA assets…`);
  const listPath = join(OUT_DIR, "ota-stale-delete.txt");
  writeFileSync(listPath, stale.join("\n"));
  sh(
    `xargs -P 16 -I {} gh release delete-asset ${MOBILE_TAG} {} --repo ${REPO} --yes < '${listPath}' || true`,
  );
}

function writeManifest(body: Record<string, string>) {
  mkdirSync(OUT_DIR, { recursive: true });
  const json = `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(PUBLIC_JSON, json);
  writeFileSync(join(ROOT, "mobile-latest.json"), json);
  const stagedJson = join(OUT_DIR, "mobile-latest.json");
  writeFileSync(stagedJson, json);
  return stagedJson;
}

const appVersion = readDesktopVersion();
const nativeVersion = readMobileNativeVersion();
mkdirSync(OUT_DIR, { recursive: true });

if (!skipBuild) {
  sh("npm run build");
}
if (!existsSync(join(DIST, "index.html"))) {
  throw new Error("dist/index.html missing — build first");
}

const zipPath = join(OUT_DIR, ZIP_NAME);
const checksum = writeSlimOtaZip(DIST, zipPath);

const stagedJson = writeManifest({
  version: nativeVersion,
  minNativeVersion: MIN_NATIVE_VERSION,
  url: ZIP_URL,
  checksum,
  message: "Redownload the app to keep playing.",
});

ensureMobileRelease();
pruneLegacyOtaFiles();
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

console.log(`\nOTA published (single zip)`);
console.log(`  desktop/web version: ${appVersion}`);
console.log(`  mobile native: ${nativeVersion}`);
console.log(`  minNativeVersion: ${MIN_NATIVE_VERSION}`);
console.log(`  zip: ${ZIP_URL}`);
console.log(`  checksum: ${checksum}`);
