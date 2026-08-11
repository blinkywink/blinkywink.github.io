/**
 * Bump the desktop version, optionally build, then publish to GitHub.
 *
 *   npm run desktop:release
 *   npm run desktop:release -- minor
 *   npm run desktop:release -- 0.3.0
 *   npm run desktop:release -- patch --skip-build
 */
import { spawnSync } from "node:child_process";
import {
  bumpSemver,
  readDesktopVersion,
  releaseTag,
  writeDesktopVersion,
} from "./desktop-version.ts";

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const noPush = args.includes("--no-push");
const kindOrVersion =
  args.find((a) => !a.startsWith("--")) ?? "patch";

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
console.log(`Version ${current} → ${next}`);

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

if (!skipBuild) {
  run("npm", ["run", "desktop:build"]);
  run("npm", ["run", "desktop:build:windows"]);
}

run("npx", ["tsx", "scripts/publish-desktop-release.ts"]);

const tag = releaseTag(next);
run("git", [
  "add",
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "public/desktop-latest.json",
]);
const commit = spawnSync(
  "git",
  ["commit", "-m", `Release desktop ${next}`],
  { stdio: "inherit" },
);
if (commit.status !== 0) {
  console.warn("Nothing to commit (version files may already be staged).");
}
run("git", ["tag", tag]);

if (!noPush) {
  run("git", ["push"]);
  run("git", ["push", "origin", tag]);
}

console.log(`\nDesktop ${next} is live. Installed apps will pick it up on next launch.`);
