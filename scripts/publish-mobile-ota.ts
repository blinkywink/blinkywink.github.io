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
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { bumpSemver, parseSemver, REPO, readDesktopVersion } from "./desktop-version.ts";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const OUT_DIR = join(ROOT, "android-artifacts");
const PUBLIC_JSON = join(ROOT, "public", "mobile-latest.json");
const OTA_ASSET_PREFIX = "ota__";
const raiseFloor = process.argv.includes("--raise-native-floor");
const skipBuild = process.argv.includes("--skip-build");

const MOBILE_TAG = "mobile";
/** Static media fallback when Capgo can't copy from the builtin APK. */
const OTA_SITE_BASE = "https://monkeycards.app";

function isGithubHostedOtaFile(relativePath: string): boolean {
  return relativePath === "index.html" || relativePath.startsWith("assets/");
}

function otaSiteUrl(relativePath: string): string {
  return `${OTA_SITE_BASE}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function otaDownloadUrl(relativePath: string, assetName: string): string {
  return isGithubHostedOtaFile(relativePath)
    ? otaFileUrl(assetName)
    : otaSiteUrl(relativePath);
}

type OtaManifestEntry = {
  file_name: string;
  file_hash: string;
  download_url: string;
};

function otaAssetName(relativePath: string): string {
  return OTA_ASSET_PREFIX + relativePath.replace(/\//g, "__");
}

function otaFileUrl(assetName: string): string {
  return `https://github.com/${REPO}/releases/download/${MOBILE_TAG}/${assetName}`;
}

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

const OTA_SKIP_DIRS = new Set(["downloads"]);
const OTA_SKIP_FILES = new Set([
  "desktop-latest.json",
  "desktop-config.json",
  "mobile-latest.json",
]);

/** Full web bundle except desktop downloads — static files copy from builtin APK. */
function listOtaBundleFiles(): string[] {
  const files: string[] = [];
  for (const name of readdirSync(DIST)) {
    if (OTA_SKIP_DIRS.has(name) || name === ".DS_Store") continue;
    const abs = join(DIST, name);
    if (statSync(abs).isDirectory()) {
      files.push(...collectOtaRelativeFiles(abs, name));
    } else if (!OTA_SKIP_FILES.has(name)) {
      files.push(name);
    }
  }
  return files.sort();
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function manifestChecksum(entries: OtaManifestEntry[]): string {
  const body = entries
    .map((entry) => `${entry.file_name}\t${entry.file_hash}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(body).digest("hex");
}

function buildOtaManifest(fromRelease: ReturnType<typeof fetchReleaseManifest>): {
  entries: OtaManifestEntry[];
  checksum: string;
  stagedFiles: string[];
} {
  rmSync(join(DIST, "downloads"), { recursive: true, force: true });

  const prevByPath = new Map<string, string>();
  for (const entry of fromRelease?.manifest ?? []) {
    if (entry.file_name && entry.file_hash) {
      prevByPath.set(entry.file_name, entry.file_hash);
    }
  }

  const relFiles = listOtaBundleFiles();
  const entries: OtaManifestEntry[] = [];
  const stagedFiles: string[] = [];
  const stagingDir = join(OUT_DIR, "ota-files");
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  for (const rel of relFiles) {
    const abs = join(DIST, rel);
    if (!existsSync(abs)) {
      throw new Error(`OTA file missing: ${rel}`);
    }
    const fileHash = sha256File(abs);
    const assetName = otaAssetName(rel);
    const staged = join(stagingDir, assetName);
    /* Only upload JS/CSS to GitHub — static media uses monkeycards.app fallback URLs. */
    if (isGithubHostedOtaFile(rel) && prevByPath.get(rel) !== fileHash) {
      copyFileSync(abs, staged);
      stagedFiles.push(staged);
    }
    entries.push({
      file_name: rel,
      file_hash: fileHash,
      download_url: otaDownloadUrl(rel, assetName),
    });
  }

  return { entries, checksum: manifestChecksum(entries), stagedFiles };
}

function ghUploadAssets(paths: string[]) {
  const batchSize = 40;
  for (let i = 0; i < paths.length; i += batchSize) {
    gh([
      "release",
      "upload",
      MOBILE_TAG,
      "--repo",
      REPO,
      "--clobber",
      ...paths.slice(i, i + batchSize),
    ]);
  }
}

function isOlderVersion(current: string, minimum: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(minimum);
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}

/**
 * Capgo / legacy clients compare manifest `version` with isOlderVersion.
 * Keep APP_VERSION (UI) separate — channel must always move forward so
 * rolled-back display versions can still reach stuck installs (e.g. 1.0.20).
 */
function nextChannelVersion(appVersion: string, previousChannel?: string): string {
  const forced = String(process.env.OTA_CHANNEL_VERSION ?? "").trim();
  if (/^\d+\.\d+\.\d+$/.test(forced)) return forced;

  const prev = String(previousChannel ?? "")
    .split("+")[0]!
    .split("-ota.")[0]!
    .trim();
  let base = appVersion;
  if (/^\d+\.\d+\.\d+$/.test(prev) && !isOlderVersion(prev, appVersion)) {
    base = prev;
  }
  let channel = bumpSemver(base, "patch");
  // Devices may still be on Capgo id 1.0.20 from a mistaken display bump even
  // after the release manifest was rolled back to 1.0.19 — channel must clear that.
  const clearFloor = "1.0.20";
  while (!isOlderVersion(clearFloor, channel)) {
    channel = bumpSemver(channel, "patch");
  }
  return channel;
}

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

const RELEASE_KEEP_ASSETS = new Set([
  "mobile-latest.json",
  "MonkeyCards.apk",
  "MonkeyCards.ipa",
  "MonkeyCards-web.zip",
]);

/** GitHub caps releases at 1000 assets — drop stale hashed ota__ JS before upload. */
function pruneStaleOtaAssets(keepAssetNames: Set<string>) {
  const data = ghJson([
    "release",
    "view",
    MOBILE_TAG,
    "--repo",
    REPO,
    "--json",
    "assets",
  ]) as { assets?: { id: number; name: string }[] };
  const stale = (data.assets ?? []).filter(
    (asset) =>
      asset.name.startsWith(OTA_ASSET_PREFIX) &&
      !keepAssetNames.has(asset.name),
  );
  if (!stale.length) return;
  console.log(`Pruning ${stale.length} stale OTA release assets…`);
  const listPath = join(OUT_DIR, "ota-stale-delete.txt");
  writeFileSync(listPath, stale.map((asset) => asset.name).join("\n"));
  sh(
    `xargs -P 16 -I {} gh release delete-asset ${MOBILE_TAG} {} --repo ${REPO} --yes < '${listPath}' || true`,
  );
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
  manifest?: OtaManifestEntry[];
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
      manifest?: OtaManifestEntry[];
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
  manifest?: OtaManifestEntry[];
}) {
  mkdirSync(OUT_DIR, { recursive: true });
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(PUBLIC_JSON, body);
  /* GitHub Pages also serves repo-root copies — keep in sync for OTA fetch fallbacks. */
  writeFileSync(join(ROOT, "mobile-latest.json"), body);
  const stagedJson = join(OUT_DIR, "mobile-latest.json");
  writeFileSync(stagedJson, body);
  return stagedJson;
}

const appVersion = readDesktopVersion();
mkdirSync(OUT_DIR, { recursive: true });
const fromRelease = fetchReleaseManifest();

// APK/IPA jobs only raise the native floor — never rewrite the web zip
// (re-uploading the zip races with OTA and can 404 mid-clobber).
if (raiseFloor && skipBuild) {
  const fromPublic = existsSync(PUBLIC_JSON)
    ? (JSON.parse(readFileSync(PUBLIC_JSON, "utf8")) as {
        checksum?: string;
        url?: string;
        version?: string;
        manifest?: OtaManifestEntry[];
      })
    : null;
  const checksum = String(fromRelease?.checksum ?? fromPublic?.checksum ?? "");
  const url = String(fromRelease?.url ?? fromPublic?.url ?? "");
  const manifest = fromRelease?.manifest ?? fromPublic?.manifest;
  const channelVersion = String(
    fromRelease?.version ?? fromPublic?.version ?? appVersion,
  ).trim();
  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new Error(
      "Cannot raise native floor: no checksum in release or public/mobile-latest.json",
    );
  }
  const stagedJson = writeManifest({
    version: channelVersion,
    minNativeVersion: appVersion,
    url,
    checksum,
    message: "Sorry, you need to redownload the app to update.",
    manifest,
  });
  ensureMobileRelease();
  ghUploadAssets([stagedJson]);
  console.log(`\nRaised minNativeVersion → ${appVersion} (OTA bundle unchanged)`);
  console.log(`  channel version: ${channelVersion}`);
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

const { entries, checksum, stagedFiles } = buildOtaManifest(fromRelease);
const channelVersion = nextChannelVersion(appVersion, fromRelease?.version);
const minNativeVersion = raiseFloor
  ? appVersion
  : prevMinNative(appVersion);

const stagedJson = writeManifest({
  version: channelVersion,
  minNativeVersion,
  url:
    entries.find((entry) => entry.file_name === "index.html")?.download_url ??
    entries[0]?.download_url ??
    "",
  checksum,
  message: "Sorry, you need to redownload the app to update.",
  manifest: entries,
});

ensureMobileRelease();

const keepAssetNames = new Set(RELEASE_KEEP_ASSETS);
for (const entry of entries) {
  if (isGithubHostedOtaFile(entry.file_name)) {
    keepAssetNames.add(otaAssetName(entry.file_name));
  }
}
pruneStaleOtaAssets(keepAssetNames);
ghUploadAssets([...stagedFiles, stagedJson]);

console.log(`\nOTA published (manifest delta)`);
console.log(`  app UI version: ${appVersion}`);
console.log(`  channel version: ${channelVersion}`);
console.log(`  files: ${entries.length}`);
console.log(`  uploaded: ${stagedFiles.length}`);
console.log(`  minNativeVersion: ${minNativeVersion}`);
console.log(`  checksum: ${checksum}`);
console.log(`  wrote ${PUBLIC_JSON}`);
