/**
 * Trigger cloud builds. Nothing heavy runs on your machine.
 *
 *   npm run ship -- apk
 *   npm run ship -- ios
 *   npm run ship -- desktop
 *   npm run ship -- mobile
 *   npm run ship -- all
 *   npm run ship -- desktop minor
 */
import { spawnSync } from "node:child_process";
import { REPO } from "./desktop-version.ts";

const args = process.argv.slice(2);
const target = (args[0] ?? "").toLowerCase();
const rest = args.slice(1);

if (!target) {
  console.error(`Usage:
  npm run ship -- apk|ios|desktop|mobile|all [desktop bump args]

Downloads (after Actions finishes):
  Desktop: https://github.com/${REPO}/releases/latest
  Mobile:  https://github.com/${REPO}/releases/tag/mobile
`);
  process.exit(1);
}

function run(command: string, cmdArgs: string[]) {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  const result = spawnSync(command, cmdArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function workflow(name: string) {
  console.log(`\n→ Triggering workflow: ${name}`);
  run("gh", ["workflow", "run", name, "--repo", REPO]);
  console.log(`  https://github.com/${REPO}/actions`);
}

switch (target) {
  case "apk":
  case "android":
    workflow("Android sideload APK");
    console.log(
      `\nWhen green: https://github.com/${REPO}/releases/download/mobile/MonkeyCards.apk`,
    );
    break;
  case "ios":
  case "ipa":
    workflow("iOS sideload IPA");
    console.log(
      `\nWhen green: https://github.com/${REPO}/releases/download/mobile/MonkeyCards.ipa`,
    );
    break;
  case "ota":
  case "web":
    workflow("Mobile OTA web bundle");
    console.log(
      `\nWhen green: https://github.com/${REPO}/releases/download/mobile/MonkeyCards-web.zip`,
    );
    break;
  case "mobile":
    workflow("Android sideload APK");
    workflow("iOS sideload IPA");
    console.log(`\nWhen green: https://github.com/${REPO}/releases/tag/mobile`);
    break;
  case "desktop":
    run("npx", ["tsx", "scripts/release-desktop.ts", ...rest]);
    break;
  case "all":
    run("npx", ["tsx", "scripts/release-desktop.ts", ...rest]);
    workflow("Android sideload APK");
    workflow("iOS sideload IPA");
    break;
  default:
    console.error(`Unknown target: ${target}`);
    process.exit(1);
}
