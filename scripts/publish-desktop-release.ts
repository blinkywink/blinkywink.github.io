/**
 * Publish signed desktop builds as a GitHub release and refresh updater JSON.
 *
 * Run after building:
 *   npm run desktop:build && npm run desktop:build:windows
 *   npm run desktop:publish
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  RELEASE_DOWNLOAD,
  REPO,
  readDesktopVersion,
  releaseTag,
} from "./desktop-version.ts";
import { dailyTowerPicks, dayStamp } from "../src/lib/packTheme.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_JSON = path.join(ROOT, "public", "desktop-latest.json");
const STAGE = path.join(ROOT, "public", "downloads");

const MAC_APP_DIRS = [
  path.join(ROOT, "src-tauri/target/release/bundle/macos"),
  path.join(ROOT, "src-tauri/target/aarch64-apple-darwin/release/bundle/macos"),
];
const MAC_DMG_DIRS = [
  path.join(ROOT, "src-tauri/target/release/bundle/dmg"),
  path.join(ROOT, "src-tauri/target/aarch64-apple-darwin/release/bundle/dmg"),
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

function copy(src: string, destName: string): string {
  fs.mkdirSync(STAGE, { recursive: true });
  const dest = path.join(STAGE, destName);
  fs.copyFileSync(src, dest);
  return dest;
}

function gh(args: string[]) {
  const result = spawnSync("gh", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed`);
  }
}

function releaseExists(tag: string): boolean {
  const result = spawnSync(
    "gh",
    ["release", "view", tag, "--repo", REPO],
    { stdio: "pipe" },
  );
  return result.status === 0;
}

function listReleaseTags(): string[] {
  const result = spawnSync(
    "gh",
    ["release", "list", "--repo", REPO, "--limit", "100", "--json", "tagName"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error("gh release list failed");
  }
  const rows = JSON.parse(result.stdout || "[]") as { tagName?: string }[];
  return rows.map((r) => String(r.tagName ?? "")).filter(Boolean);
}

/** Drop every GitHub release except the one we just published. */
function deleteOlderReleases(keepTag: string) {
  for (const oldTag of listReleaseTags()) {
    if (oldTag === keepTag) continue;
    console.log(`Deleting old release ${oldTag}`);
    const del = spawnSync(
      "gh",
      [
        "release",
        "delete",
        oldTag,
        "--repo",
        REPO,
        "--yes",
        "--cleanup-tag",
      ],
      { stdio: "inherit" },
    );
    if (del.status !== 0) {
      console.warn(`Could not delete ${oldTag} - continuing`);
    }
  }
}

/** Keep only this version's local installers/DMGs so leftover builds don't pile up. */
function deleteOlderLocalBuilds(keepVersion: string) {
  const dirs = [
    path.join(ROOT, "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis"),
    path.join(ROOT, "src-tauri/target/release/bundle/nsis"),
    path.join(ROOT, "src-tauri/target/release/bundle/dmg"),
    path.join(ROOT, "src-tauri/target/aarch64-apple-darwin/release/bundle/dmg"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(exe|dmg|sig)$/i.test(name)) continue;
      if (name.includes(keepVersion)) continue;
      const full = path.join(dir, name);
      try {
        fs.unlinkSync(full);
        console.log(`Deleted local ${path.relative(ROOT, full)}`);
      } catch (err) {
        console.warn(
          `Could not delete ${full}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}

const version = readDesktopVersion();
const tag = releaseTag(version);

const macTar = newestMatch(
  MAC_APP_DIRS,
  (name) => name.endsWith(".app.tar.gz") && !name.endsWith(".sig"),
);
const macDmg = newestMatch(MAC_DMG_DIRS, (name) => name.endsWith(".dmg"));
const winExe = newestMatch(
  WIN_DIRS,
  (name) =>
    (name.endsWith("-setup.exe") || name.endsWith("_setup.exe")) &&
    !name.endsWith(".sig"),
);

if (!macTar && !winExe) {
  console.error("No signed updater artifacts found. Build first:");
  console.error("  npm run desktop:build");
  console.error("  npm run desktop:build:windows");
  process.exit(1);
}

const staged: string[] = [];
const platforms: Record<string, PlatformEntry> = {};

if (macTar) {
  const updater = copy(macTar, "blinkywink-mac.app.tar.gz");
  copy(`${macTar}.sig`, "blinkywink-mac.app.tar.gz.sig");
  staged.push(updater, `${updater}.sig`);
  platforms["darwin-aarch64"] = {
    signature: readSig(macTar),
    url: `${RELEASE_DOWNLOAD}/${tag}/blinkywink-mac.app.tar.gz`,
  };
  console.log(`Mac updater: ${path.basename(macTar)}`);
}

if (macDmg) {
  staged.push(copy(macDmg, "blinkywink-mac.dmg"));
  console.log(`Mac dmg: ${path.basename(macDmg)}`);
}

if (winExe) {
  const updater = copy(winExe, "blinkywink-windows-setup.exe");
  copy(`${winExe}.sig`, "blinkywink-windows-setup.exe.sig");
  staged.push(updater, `${updater}.sig`);
  platforms["windows-x86_64"] = {
    signature: readSig(winExe),
    url: `${RELEASE_DOWNLOAD}/${tag}/blinkywink-windows-setup.exe`,
  };
  console.log(`Windows updater: ${path.basename(winExe)}`);
}

const shopDay = dayStamp();
const featuredTowers = dailyTowerPicks(3, shopDay);

const manifest = {
  version,
  notes: `blinkywink.co desktop ${version}`,
  pub_date: new Date().toISOString(),
  shopDay,
  featuredTowers,
  platforms,
};

fs.writeFileSync(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
const latestJson = path.join(STAGE, "latest.json");
fs.copyFileSync(OUT_JSON, latestJson);
staged.push(latestJson);

const configPath = path.join(ROOT, "public", "desktop-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<
  string,
  unknown
>;
config.minDesktopVersion = version;
config.version = version;
config.shopDay = shopDay;
config.featuredTowers = featuredTowers;
config.message = "This desktop app is out of date. Update to keep playing.";
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const notes = `Desktop ${version}

The app installs this update on the next check (launch, page change, or shop).`;

if (releaseExists(tag)) {
  gh(["release", "upload", tag, "--repo", REPO, "--clobber", ...staged]);
} else {
  gh([
    "release",
    "create",
    tag,
    "--repo",
    REPO,
    "--title",
    `blinkywink.co ${version}`,
    "--notes",
    notes,
    ...staged,
  ]);
}

deleteOlderReleases(tag);
deleteOlderLocalBuilds(version);

console.log(`\nPublished ${tag} (older GitHub releases removed)`);
console.log(`  ${RELEASE_DOWNLOAD}/${tag}/latest.json`);
console.log(`  wrote ${path.relative(ROOT, OUT_JSON)}`);
