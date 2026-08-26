/**
 * After CI builds Mac + Windows with tauri-action, normalize asset names and
 * write updater latest.json so auto-update + site download buttons keep working.
 *
 * Expects env: GITHUB_REF_NAME (e.g. v1.0.18), GITHUB_REPOSITORY, GH_TOKEN/GITHUB_TOKEN
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
const STAGE = path.join(ROOT, ".ci-desktop-stage");
const OUT_JSON = path.join(ROOT, "public", "desktop-latest.json");

function gh(args: string[], opts?: { pipe?: boolean }) {
  const env = { ...process.env };
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: opts?.pipe ? "pipe" : "inherit",
    env,
  });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

function readSig(filePath: string): string {
  const sigPath = `${filePath}.sig`;
  if (!fs.existsSync(sigPath)) {
    throw new Error(`Missing signature: ${sigPath}`);
  }
  const raw = fs.readFileSync(sigPath, "utf8").trim();
  // Tauri expects the signature field to be base64(minisign file bytes).
  if (raw.startsWith("untrusted comment:")) {
    return Buffer.from(`${raw}\n`).toString("base64");
  }
  return raw;
}

function pick(
  files: string[],
  test: (name: string) => boolean,
): string | null {
  const hits = files.filter((f) => test(path.basename(f)));
  if (!hits.length) return null;
  hits.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return hits[0]!;
}

function downloadAll(tag: string) {
  fs.mkdirSync(STAGE, { recursive: true });
  gh([
    "release",
    "download",
    tag,
    "--repo",
    REPO,
    "--dir",
    STAGE,
    "--clobber",
  ]);
}

const version = readDesktopVersion();
// Prefer an explicit tag — Actions may force GITHUB_REF_NAME to the branch
// (e.g. "main" on workflow_dispatch) even when the step sets it.
const tag =
  process.env.DESKTOP_RELEASE_TAG?.trim() ||
  (/^v\d+\.\d+\.\d+$/.test(process.env.GITHUB_REF_NAME?.trim() ?? "")
    ? process.env.GITHUB_REF_NAME!.trim()
    : "") ||
  releaseTag(version);

if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error(`Expected desktop tag like v1.2.3, got ${tag}`);
}

fs.rmSync(STAGE, { recursive: true, force: true });
console.log(`Downloading assets from ${tag}…`);
downloadAll(tag);

const stagedFiles = fs
  .readdirSync(STAGE)
  .map((n) => path.join(STAGE, n))
  .filter((p) => fs.statSync(p).isFile());

if (!stagedFiles.length) {
  throw new Error(`No assets on release ${tag} yet`);
}

console.log(`Normalizing ${stagedFiles.length} files…`);

const macTar = pick(
  stagedFiles,
  (n) => n.endsWith(".app.tar.gz") && !n.endsWith(".sig"),
);
const macDmg = pick(stagedFiles, (n) => n.endsWith(".dmg") && !n.endsWith(".sig"));
const winExe = pick(
  stagedFiles,
  (n) =>
    (n.endsWith("-setup.exe") ||
      n.endsWith("_setup.exe") ||
      (n.endsWith(".exe") && n.toLowerCase().includes("setup"))) &&
    !n.endsWith(".sig"),
);

if (!macTar && !winExe) {
  throw new Error(
    `Could not find Mac .app.tar.gz or Windows setup.exe in ${tag} assets`,
  );
}

const upload: string[] = [];
const platforms: Record<string, { signature: string; url: string }> = {};

function stageAs(src: string, destName: string) {
  const dest = path.join(STAGE, destName);
  fs.copyFileSync(src, dest);
  upload.push(dest);
  return dest;
}

if (macTar) {
  const updater = stageAs(macTar, "blinkywink-mac.app.tar.gz");
  const sigSrc = `${macTar}.sig`;
  if (!fs.existsSync(sigSrc)) {
    throw new Error(`Missing ${path.basename(macTar)}.sig`);
  }
  stageAs(sigSrc, "blinkywink-mac.app.tar.gz.sig");
  platforms["darwin-aarch64"] = {
    signature: readSig(updater),
    url: `${RELEASE_DOWNLOAD}/${tag}/blinkywink-mac.app.tar.gz`,
  };
}

if (macDmg) {
  stageAs(macDmg, "blinkywink-mac.dmg");
}

if (winExe) {
  const updater = stageAs(winExe, "blinkywink-windows-setup.exe");
  const sigSrc = `${winExe}.sig`;
  if (!fs.existsSync(sigSrc)) {
    throw new Error(`Missing ${path.basename(winExe)}.sig`);
  }
  stageAs(sigSrc, "blinkywink-windows-setup.exe.sig");
  platforms["windows-x86_64"] = {
    signature: readSig(updater),
    url: `${RELEASE_DOWNLOAD}/${tag}/blinkywink-windows-setup.exe`,
  };
}

const shopDay = dayStamp();
const featuredTowers = dailyTowerPicks(3, shopDay);
const manifest = {
  version,
  notes: `Monkey Cards desktop ${version}`,
  pub_date: new Date().toISOString(),
  shopDay,
  featuredTowers,
  platforms,
};

fs.writeFileSync(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
// GitHub Pages serves the repo root (not Vite public/), so keep root mirrors too.
fs.writeFileSync(
  path.join(ROOT, "desktop-latest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
const latestJson = path.join(STAGE, "latest.json");
fs.copyFileSync(OUT_JSON, latestJson);
upload.push(latestJson);

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
fs.writeFileSync(
  path.join(ROOT, "desktop-config.json"),
  `${JSON.stringify(config, null, 2)}\n`,
);

gh([
  "release",
  "upload",
  tag,
  "--repo",
  REPO,
  "--clobber",
  ...upload,
]);

console.log(`\nUpdater + stable downloads ready on ${tag}`);
console.log(`  ${RELEASE_DOWNLOAD}/${tag}/latest.json`);
console.log(`  ${RELEASE_DOWNLOAD}/${tag}/blinkywink-mac.dmg`);
console.log(`  ${RELEASE_DOWNLOAD}/${tag}/blinkywink-windows-setup.exe`);
