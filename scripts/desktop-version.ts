import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

export const TAURI_CONF = path.join(ROOT, "src-tauri", "tauri.conf.json");
export const CARGO_TOML = path.join(ROOT, "src-tauri", "Cargo.toml");
export const CARGO_LOCK = path.join(ROOT, "src-tauri", "Cargo.lock");
export const PACKAGE_JSON = path.join(ROOT, "package.json");
export const DESKTOP_CONFIG = path.join(ROOT, "public", "desktop-config.json");

const MOBILE_VERSION_FILE = path.join(
  ROOT,
  "src",
  "lib",
  "mobileNativeVersion.ts",
);
const MOBILE_NATIVE_RE = /^\d+\.\d+\.\d+\.\d+$/;

export function readDesktopVersion(): string {
  const conf = JSON.parse(fs.readFileSync(TAURI_CONF, "utf8")) as {
    version?: string;
  };
  const version = String(conf.version ?? "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Bad desktop version in tauri.conf.json: ${version}`);
  }
  return version;
}

/** Desktop is x.y.z; mobile native is x.y.z.w. Missing parts compare as 0. */
export function parseVersionParts(version: string): number[] {
  const cleaned = version.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "0.0.0";
  const parts = cleaned.split(".").map((n) => Number.parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts;
}

export function parseSemver(version: string): [number, number, number] {
  const parts = parseVersionParts(version);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function isOlderVersion(current: string, minimum: string): boolean {
  const a = parseVersionParts(current);
  const b = parseVersionParts(minimum);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return true;
    if (av > bv) return false;
  }
  return false;
}

export function bumpSemver(
  version: string,
  kind: "patch" | "minor" | "major",
): string {
  const [major, minor, patch] = parseSemver(version);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function readMobileNativeVersion(): string {
  const text = fs.readFileSync(MOBILE_VERSION_FILE, "utf8");
  const match = text.match(/MOBILE_NATIVE_VERSION = "([^"]+)"/);
  const version = String(match?.[1] ?? "").trim();
  if (!MOBILE_NATIVE_RE.test(version)) {
    throw new Error(`Bad mobile native version: ${version}`);
  }
  return version;
}

/** Android versionCode / iOS CURRENT_PROJECT_VERSION from 1.0.x.y */
export function mobileVersionCode(version: string): number {
  const [major, minor, native, build] = parseVersionParts(version);
  return (
    (major ?? 0) * 1_000_000 +
    (minor ?? 0) * 10_000 +
    (native ?? 0) * 100 +
    (build ?? 0)
  );
}

export function writeDesktopVersion(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Version must be x.y.z, got ${version}`);
  }

  const tauri = JSON.parse(fs.readFileSync(TAURI_CONF, "utf8")) as {
    version: string;
  };
  tauri.version = version;
  fs.writeFileSync(TAURI_CONF, `${JSON.stringify(tauri, null, 2)}\n`);

  const cargo = fs.readFileSync(CARGO_TOML, "utf8");
  fs.writeFileSync(
    CARGO_TOML,
    cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`),
  );

  if (fs.existsSync(CARGO_LOCK)) {
    const lock = fs.readFileSync(CARGO_LOCK, "utf8");
    fs.writeFileSync(
      CARGO_LOCK,
      lock.replace(
        /(name = "bloon-arcade"\nversion = ")[^"]+/,
        `$1${version}`,
      ),
    );
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")) as {
    version: string;
  };
  pkg.version = version;
  fs.writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);

  const appVersionPath = path.join(ROOT, "src", "lib", "appVersion.ts");
  fs.writeFileSync(
    appVersionPath,
    `/** Website + desktop version (x.y.z). Mobile native is MOBILE_NATIVE_VERSION. */\nexport const APP_VERSION = "${version}";\n`,
  );
}

/** Keep Capacitor iOS/Android native version strings in sync. */
export function writeMobileNativeVersion(version: string) {
  if (!MOBILE_NATIVE_RE.test(version)) {
    throw new Error(`Mobile version must be x.y.z.w, got ${version}`);
  }

  fs.writeFileSync(
    MOBILE_VERSION_FILE,
    `/** IPA/APK native version. Independent of desktop/website APP_VERSION.

    Format: 1.0.{native}.{build}
    - 1.0 stays the product line
    - last two numbers are mobile-only
    Web OTA does not change this string; Capgo uses checksums instead.
*/
export const MOBILE_NATIVE_VERSION = "${version}";
`,
  );

  const versionCode = mobileVersionCode(version);

  const pbx = path.join(ROOT, "ios", "App", "App.xcodeproj", "project.pbxproj");
  if (fs.existsSync(pbx)) {
    let text = fs.readFileSync(pbx, "utf8");
    text = text.replace(
      /MARKETING_VERSION = [^;]+;/g,
      `MARKETING_VERSION = ${version};`,
    );
    text = text.replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${versionCode};`,
    );
    fs.writeFileSync(pbx, text);
  }

  const gradle = path.join(ROOT, "android", "app", "build.gradle");
  if (fs.existsSync(gradle)) {
    let text = fs.readFileSync(gradle, "utf8");
    text = text.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
    text = text.replace(
      /versionName\s+"[^"]+"/,
      `versionName "${version}"`,
    );
    fs.writeFileSync(gradle, text);
  }

  const widget = path.join(ROOT, "ios", "App", "App", "config.xml");
  if (fs.existsSync(widget)) {
    let text = fs.readFileSync(widget, "utf8");
    text = text.replace(
      /(<widget[^>]*\sversion=")[^"]+(")/,
      `$1${version}$2`,
    );
    fs.writeFileSync(widget, text);
  }
}

export function releaseTag(version: string): string {
  return `v${version.replace(/^v/i, "")}`;
}

export const REPO = "blinkywink/blinkywink.github.io";
export const RELEASE_DOWNLOAD = `https://github.com/${REPO}/releases/download`;
