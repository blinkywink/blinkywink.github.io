/**
 * Build an unsigned iOS .ipa for sideload tools (Sideloadly / AltStore / etc.).
 * Requires Xcode + Command Line Tools. Run after `npm run mobile:sync`.
 *
 * Usage: npx tsx scripts/build-ios-ipa.ts
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const iosApp = join(root, "ios", "App");
const project = join(iosApp, "App.xcodeproj");
const outDir = join(root, "ios-artifacts");
const ipaName = "MonkeyCards.ipa";

function sh(cmd: string, cwd = iosApp) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function findApp(derived: string): string {
  const products = join(derived, "Build", "Products", "Release-iphoneos");
  if (!existsSync(products)) {
    throw new Error(`Missing build products at ${products}`);
  }
  const app = readdirSync(products).find((n) => n.endsWith(".app"));
  if (!app) throw new Error(`No .app in ${products}`);
  return join(products, app);
}

function main() {
  if (!existsSync(project)) {
    throw new Error("ios/App/App.xcodeproj missing — run: npm run mobile:sync");
  }

  const derived = join(iosApp, "build", "DerivedData");
  rmSync(derived, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  sh(
    [
      "xcodebuild",
      "-project App.xcodeproj",
      "-scheme App",
      "-configuration Release",
      "-sdk iphoneos",
      "-destination 'generic/platform=iOS'",
      `-derivedDataPath '${derived}'`,
      "-allowProvisioningUpdates",
      "CODE_SIGNING_ALLOWED=NO",
      "CODE_SIGNING_REQUIRED=NO",
      'CODE_SIGN_IDENTITY=""',
      "build",
    ].join(" "),
  );

  const appPath = findApp(derived);
  const stage = mkdtempSync(join(tmpdir(), "monkeycards-ipa-"));
  const payload = join(stage, "Payload");
  mkdirSync(payload);
  cpSync(appPath, join(payload, "App.app"), { recursive: true });

  const ipaPath = join(outDir, ipaName);
  rmSync(ipaPath, { force: true });
  sh(`ditto -c -k --sequesterRsrc --keepParent Payload '${ipaPath}'`, stage);

  writeFileSync(
    join(outDir, "README.txt"),
    [
      "Monkey Cards — unsigned sideload IPA",
      "",
      "1. Download MonkeyCards.ipa",
      "2. Open it in your sideload tool (Sideloadly, AltStore, Feather, etc.)",
      "3. Sign with your free Apple ID and install",
      "",
      "Free Apple ID installs expire ~7 days and need re-sign.",
      "",
    ].join("\n"),
  );

  rmSync(stage, { recursive: true, force: true });
  console.log(`\nIPA ready: ${ipaPath}`);
}

main();
