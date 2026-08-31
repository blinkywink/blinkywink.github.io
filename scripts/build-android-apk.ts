/**
 * Build a sideloadable Android APK (debug-signed, installable on devices).
 * Used by CI and `npm run mobile:apk`.
 */
import { execSync } from "node:child_process";
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
import { readMobileNativeVersion } from "./desktop-version.ts";

const root = process.cwd();
const android = join(root, "android");
const outDir = join(root, "android-artifacts");
const apkName = "MonkeyCards.apk";

function sh(cmd: string, cwd = android) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
}

function findApk(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, name.name);
      if (name.isDirectory()) walk(full);
      else if (
        name.name.endsWith(".apk") &&
        !name.name.endsWith("-unsigned.apk")
      ) {
        hits.push(full);
      }
    }
  };
  walk(dir);
  if (!hits.length) return null;
  hits.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return hits[0]!;
}

function main() {
  if (!existsSync(join(android, "gradlew"))) {
    throw new Error("android/ missing — run: npx cap add android");
  }

  const version = readMobileNativeVersion();
  mkdirSync(outDir, { recursive: true });

  const gradle = join(android, "app", "build.gradle");
  if (existsSync(gradle)) {
    let text = readFileSync(gradle, "utf8");
    text = text.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
    writeFileSync(gradle, text);
  }

  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  sh(`${gradlew} assembleDebug --no-daemon`);

  const built =
    findApk(join(android, "app", "build", "outputs", "apk", "debug")) ??
    findApk(join(android, "app", "build", "outputs", "apk"));
  if (!built) throw new Error("No APK produced under android/app/build/outputs");

  const dest = join(outDir, apkName);
  rmSync(dest, { force: true });
  copyFileSync(built, dest);

  writeFileSync(
    join(outDir, "README.txt"),
    [
      "Monkey Cards — Android sideload APK (debug-signed)",
      `Version: ${version}`,
      "",
      "Install: enable Install unknown apps, open MonkeyCards.apk on the phone.",
      "This is not a Play Store build.",
      "",
    ].join("\n"),
  );

  console.log(`\nWrote ${dest}`);
}

main();
