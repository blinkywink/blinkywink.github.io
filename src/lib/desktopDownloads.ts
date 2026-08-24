/** Hosted desktop installers (always the current GitHub release). */
export const DESKTOP_MAC_DMG =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/blinkywink-mac.dmg";
export const DESKTOP_WINDOWS_SETUP =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/blinkywink-windows-setup.exe";

export const DESKTOP_RELEASE_TAG_BASE =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download";

export type DesktopRemoteConfig = {
  minDesktopVersion: string;
  message: string;
  downloadMac: string;
  downloadWindows: string;
  version?: string;
  shopDay?: string;
  featuredTowers?: string[];
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
    const featuredTowers = Array.isArray(data.featuredTowers)
      ? data.featuredTowers.map((n) => String(n).trim()).filter(Boolean)
      : undefined;
    return {
      minDesktopVersion,
      message: String(data.message ?? DEFAULT_CONFIG.message),
      downloadMac: String(data.downloadMac ?? DEFAULT_CONFIG.downloadMac),
      downloadWindows: String(data.downloadWindows ?? DEFAULT_CONFIG.downloadWindows),
      version: data.version ? String(data.version) : undefined,
      shopDay: data.shopDay ? String(data.shopDay) : undefined,
      featuredTowers: featuredTowers?.length ? featuredTowers : undefined,
    };
  } catch {
    return null;
  }
}

/** Live site config (Rust fetch - not the bundled copy). */
export async function fetchDesktopRemoteConfig(): Promise<DesktopRemoteConfig | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string>("fetch_desktop_config");
    return parseDesktopConfig(raw);
  } catch {
    return null;
  }
}

const LATEST_URLS = [
  `${DESKTOP_RELEASE_TAG_BASE}/latest.json`,
  "https://blinkywink.github.io/desktop-latest.json",
];

/** Updater manifest on GitHub Releases / the site (version + today's shop). */
export async function fetchDesktopLatestManifest(): Promise<DesktopRemoteConfig | null> {
  for (const base of LATEST_URLS) {
    try {
      const res = await fetch(`${base}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as Partial<DesktopRemoteConfig> & {
        version?: string;
      };
      const version = String(data.version ?? "").trim();
      if (!version) continue;
      const featuredTowers = Array.isArray(data.featuredTowers)
        ? data.featuredTowers.map((n) => String(n).trim()).filter(Boolean)
        : undefined;
      return {
        ...DEFAULT_CONFIG,
        minDesktopVersion: version,
        version,
        shopDay: data.shopDay ? String(data.shopDay) : undefined,
        featuredTowers: featuredTowers?.length ? featuredTowers : undefined,
      };
    } catch {
      /* try next host */
    }
  }
  return null;
}

export function mergeDesktopSignals(
  ...parts: Array<DesktopRemoteConfig | null>
): DesktopRemoteConfig | null {
  const live = parts.filter((p): p is DesktopRemoteConfig => Boolean(p));
  if (!live.length) return null;
  const base = { ...DEFAULT_CONFIG };
  for (const part of live) {
    if (part.minDesktopVersion) base.minDesktopVersion = part.minDesktopVersion;
    if (part.message) base.message = part.message;
    if (part.downloadMac) base.downloadMac = part.downloadMac;
    if (part.downloadWindows) base.downloadWindows = part.downloadWindows;
    if (part.version) base.version = part.version;
    if (part.shopDay) base.shopDay = part.shopDay;
    if (part.featuredTowers?.length) base.featuredTowers = part.featuredTowers;
  }
  return base;
}
