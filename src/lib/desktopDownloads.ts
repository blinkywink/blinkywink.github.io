/** Hosted desktop installers (GitHub Releases). */
export const DESKTOP_MAC_DMG =
  "https://github.com/blinkywink/blinkywink.github.io/releases/download/beta/blinkywink-mac.dmg";
export const DESKTOP_WINDOWS_SETUP =
  "https://github.com/blinkywink/blinkywink.github.io/releases/download/beta/blinkywink-windows-setup.exe";

export const DESKTOP_RELEASE_TAG_BASE =
  "https://github.com/blinkywink/blinkywink.github.io/releases/download/beta";

export type DesktopRemoteConfig = {
  minDesktopVersion: string;
  message: string;
  downloadMac: string;
  downloadWindows: string;
};

const DEFAULT_CONFIG: DesktopRemoteConfig = {
  minDesktopVersion: "0.2.0",
  message: "This desktop app is out of date. Update to keep playing.",
  downloadMac: DESKTOP_MAC_DMG,
  downloadWindows: DESKTOP_WINDOWS_SETUP,
};

export function parseSemver(version: string): [number, number, number] {
  const cleaned = version.trim().replace(/^v/i, "").split("-")[0] ?? "0.0.0";
  const parts = cleaned.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** True when `current` is strictly older than `minimum`. */
export function isOlderVersion(current: string, minimum: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(minimum);
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}

function parseDesktopConfig(raw: string): DesktopRemoteConfig | null {
  try {
    const data = JSON.parse(raw) as Partial<DesktopRemoteConfig>;
    const minDesktopVersion = String(data.minDesktopVersion ?? "").trim();
    if (!minDesktopVersion) return null;
    return {
      minDesktopVersion,
      message: String(data.message ?? DEFAULT_CONFIG.message),
      downloadMac: String(data.downloadMac ?? DEFAULT_CONFIG.downloadMac),
      downloadWindows: String(data.downloadWindows ?? DEFAULT_CONFIG.downloadWindows),
    };
  } catch {
    return null;
  }
}

/** Live site config (Rust fetch — not the bundled copy). */
export async function fetchDesktopRemoteConfig(): Promise<DesktopRemoteConfig | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string>("fetch_desktop_config");
    return parseDesktopConfig(raw);
  } catch {
    return null;
  }
}
