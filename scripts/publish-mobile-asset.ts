/**
 * Upsert a file onto the rolling GitHub Release tag `mobile` (OTA / sideload
 * pipeline) and mirror it onto the latest desktop release so APK/IPA show up
 * on the newest release page and `releases/latest/download/…`.
 *
 *   npx tsx scripts/publish-mobile-asset.ts android-artifacts/MonkeyCards.apk
 *   npx tsx scripts/publish-mobile-asset.ts ios-artifacts/MonkeyCards.ipa
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { REPO } from "./desktop-version.ts";

const MOBILE_TAG = "mobile";
const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/publish-mobile-asset.ts <path>");
  process.exit(1);
}
const abs = path.resolve(file);
if (!existsSync(abs)) {
  console.error(`Missing file: ${abs}`);
  process.exit(1);
}

function gh(args: string[], opts?: { pipe?: boolean }) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: opts?.pipe ? "pipe" : "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

function releaseExists(tag: string): boolean {
  const result = spawnSync(
    "gh",
    ["release", "view", tag, "--repo", REPO],
    { stdio: "pipe", env: process.env },
  );
  return result.status === 0;
}

function latestDesktopTag(): string | null {
  const out = gh(
    ["release", "view", "--repo", REPO, "--json", "tagName", "--jq", ".tagName"],
    { pipe: true },
  ).trim();
  return /^v\d+\.\d+\.\d+$/.test(out) ? out : null;
}

if (!releaseExists(MOBILE_TAG)) {
  gh([
    "release",
    "create",
    MOBILE_TAG,
    "--repo",
    REPO,
    "--title",
    "Monkey Cards mobile (sideload)",
    "--notes",
    "Rolling sideload builds. APK / IPA for testing — not App Store / Play Store.",
    "--latest=false",
  ]);
}

gh([
  "release",
  "upload",
  MOBILE_TAG,
  "--repo",
  REPO,
  "--clobber",
  abs,
]);

const name = path.basename(abs);
console.log(
  `\nPublished https://github.com/${REPO}/releases/download/${MOBILE_TAG}/${name}`,
);

const latest = latestDesktopTag();
if (latest && latest !== MOBILE_TAG) {
  gh([
    "release",
    "upload",
    latest,
    "--repo",
    REPO,
    "--clobber",
    abs,
  ]);
  console.log(
    `Mirrored to latest release: https://github.com/${REPO}/releases/download/${latest}/${name}`,
  );
} else {
  console.warn("No v* latest release to mirror onto — skipped.");
}
