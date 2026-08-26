/**
 * Local-first desktop release: bump version, build Mac + Windows here,
 * publish to GitHub Releases + updater latest.json.
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
const skipBuild = args.includes("--skip-build");
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
  console.error(
    "Usage: npm run desktop:release -- [patch|minor|major|x.y.z] [--no-push] [--skip-build]",
  );
  process.exit(1);
}

writeDesktopVersion(next);
console.log(`Version ${current} → ${next} (local Mac + Windows build)`);

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
// Recreate tag locally so publish targets the right version.
spawnSync("git", ["tag", "-d", tag], { stdio: "pipe" });
run("git", ["tag", tag]);

if (!skipBuild) {
  console.log("\n→ Building Mac (app + dmg + updater)…");
  run("npm", ["run", "desktop:build"]);
  console.log("\n→ Building Windows (nsis + updater)…");
  run("npm", ["run", "desktop:build:windows"]);
}

console.log("\n→ Publishing to GitHub Releases…");
run("npm", ["run", "desktop:publish"]);

if (!noPush) {
  run("git", [
    "add",
    "public/desktop-latest.json",
    "public/desktop-config.json",
    "desktop-latest.json",
    "desktop-config.json",
  ]);
  spawnSync(
    "git",
    ["commit", "-m", `chore: sync desktop-latest for ${tag}`],
    { stdio: "inherit" },
  );
  run("git", ["push"]);
  // Force-update remote tag to this commit (no Actions tag build — local publish already did it).
  run("git", ["push", "origin", `refs/tags/${tag}`, "--force"]);
  console.log(`\nPublished ${tag} from this machine.`);
  console.log(
    `Downloads: https://github.com/blinkywink/blinkywink.github.io/releases/latest`,
  );
} else {
  console.log(`\nBuilt + published locally (--no-push). Push when ready:`);
  console.log(`  git push && git push origin ${tag} --force`);
}
