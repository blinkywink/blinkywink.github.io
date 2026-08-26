/**
 * Cloud-first desktop release: bump version, commit, tag, push.
 * GitHub Actions builds Mac + Windows, signs, and publishes updater assets.
 *
 *   npm run desktop:release
 *   npm run desktop:release -- minor
 *   npm run desktop:release -- 1.1.0
 *   npm run desktop:release -- patch --no-push
 */
import { spawnSync } from "node:child_process";
import {
  bumpSemver,
  readDesktopVersion,
  releaseTag,
  writeDesktopVersion,
} from "./desktop-version.ts";

const args = process.argv.slice(2);
const noPush = args.includes("--no-push");
const kindOrVersion = args.find((a) => !a.startsWith("--")) ?? "patch";

const current = readDesktopVersion();
const next = /^\d+\.\d+\.\d+$/.test(kindOrVersion)
  ? kindOrVersion
  : kindOrVersion === "major" ||
      kindOrVersion === "minor" ||
      kindOrVersion === "patch"
    ? bumpSemver(current, kindOrVersion)
    : null;

if (!next) {
  console.error("Usage: npm run desktop:release -- [patch|minor|major|x.y.z]");
  process.exit(1);
}

writeDesktopVersion(next);
console.log(`Version ${current} → ${next} (cloud build)`);

function run(command: string, cmdArgs: string[]) {
  const result = spawnSync(command, cmdArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("git", [
  "add",
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src/lib/appVersion.ts",
]);

const commit = spawnSync(
  "git",
  ["commit", "-m", `Release desktop ${next}`],
  { stdio: "inherit" },
);
if (commit.status !== 0) {
  console.warn("Nothing to commit (version files may already match).");
}

const tag = releaseTag(next);
run("git", ["tag", tag]);

if (!noPush) {
  run("git", ["push"]);
  run("git", ["push", "origin", tag]);
  console.log(`\nPushed ${tag}. GitHub Actions is building Mac + Windows.`);
  console.log(
    "When green: https://github.com/blinkywink/blinkywink.github.io/releases/latest",
  );
  console.log("Auto-update uses that release's latest.json — no local build needed.");
} else {
  console.log(`\nCreated local tag ${tag} (--no-push). Push when ready:`);
  console.log(`  git push && git push origin ${tag}`);
}
