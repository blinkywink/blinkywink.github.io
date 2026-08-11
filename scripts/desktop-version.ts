import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

export const TAURI_CONF = path.join(ROOT, "src-tauri", "tauri.conf.json");
export const CARGO_TOML = path.join(ROOT, "src-tauri", "Cargo.toml");
export const CARGO_LOCK = path.join(ROOT, "src-tauri", "Cargo.lock");
export const PACKAGE_JSON = path.join(ROOT, "package.json");
export const DESKTOP_CONFIG = path.join(ROOT, "public", "desktop-config.json");

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

export function parseSemver(version: string): [number, number, number] {
  const cleaned = version.trim().replace(/^v/i, "").split("-")[0] ?? "0.0.0";
  const parts = cleaned.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
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
}

export function releaseTag(version: string): string {
  return `v${version.replace(/^v/i, "")}`;
}

export const REPO = "blinkywink/blinkywink.github.io";
export const RELEASE_DOWNLOAD = `https://github.com/${REPO}/releases/download`;
