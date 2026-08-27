/** Mobile OTA / force-redownload signals (Capacitor sideload shells). */

import { APP_VERSION } from "./appVersion";
import { isOlderVersion } from "./desktopDownloads";

export const MOBILE_APK_URL =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/MonkeyCards.apk";
export const MOBILE_IPA_URL =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/MonkeyCards.ipa";
export const MOBILE_RELEASE_PAGE =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest";

export type MobileLatestManifest = {
  /** Latest web bundle version (OTA). */
  version: string;
  /** Minimum native APK/IPA version that can run this web (or any OTA). */
  minNativeVersion: string;
  /** Zip of `dist/` for the Capgo updater. */
  url: string;
  /** sha256 hex of the zip. */
  checksum: string;
  message?: string;
};

/** Prefer release asset when mirrors disagree on the same channel version. */
const MANIFEST_SOURCES: { url: string; rank: number }[] = [
  {
    url: "https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/mobile-latest.json",
    rank: 4,
  },
  {
    url: "https://raw.githubusercontent.com/blinkywink/blinkywink.github.io/main/public/mobile-latest.json",
    rank: 3,
  },
  { url: "https://blinkywink.github.io/public/mobile-latest.json", rank: 2 },
  { url: "https://blinkywink.github.io/mobile-latest.json", rank: 1 },
];

export async function fetchMobileLatestManifest(): Promise<MobileLatestManifest | null> {
  type Scored = { manifest: MobileLatestManifest; rank: number };
  const found: Scored[] = [];

  await Promise.all(
    MANIFEST_SOURCES.map(async ({ url, rank }) => {
      try {
        const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<MobileLatestManifest>;
        const version = String(data.version ?? "").trim();
        const minNativeVersion = String(data.minNativeVersion ?? "").trim();
        const manifestUrl = String(data.url ?? "").trim();
        const checksum = String(data.checksum ?? "").trim();
        if (!version || !minNativeVersion || !manifestUrl) return;
        found.push({
          rank,
          manifest: {
            version,
            minNativeVersion,
            url: manifestUrl,
            checksum,
            message: data.message ? String(data.message) : undefined,
          },
        });
      } catch {
        /* try next */
      }
    }),
  );

  if (found.length === 0) return null;

  return found.reduce((best, cur) => {
    if (isOlderVersion(cur.manifest.version, best.manifest.version)) return best;
    if (isOlderVersion(best.manifest.version, cur.manifest.version)) return cur;
    return cur.rank > best.rank ? cur : best;
  }).manifest;
}

export function needsNativeRedownload(
  nativeVersion: string,
  remote: MobileLatestManifest,
): boolean {
  return isOlderVersion(nativeVersion, remote.minNativeVersion);
}

export function otaChecksumSuffix(checksum: string): string {
  return checksum.replace(/[^a-f0-9]/gi, "").slice(0, 12);
}

/**
 * Capgo bundle id — unique per zip checksum so hotfixes can ship without
 * changing the user-facing APP_VERSION.
 */
export function otaBundleVersion(remote: MobileLatestManifest): string {
  const sum = otaChecksumSuffix(remote.checksum);
  const base = remote.version.split("+")[0]!.split("-ota.")[0]!;
  return sum ? `${base}-ota.${sum}` : base;
}

function channelDisplayVersion(installed: string): string {
  return (
    installed.split("+")[0]?.split("-ota.")[0]?.trim() || installed.trim()
  );
}

function installedChecksumSuffix(installed: string): string | null {
  const match = installed.match(/-ota\.([a-f0-9]+)/i);
  return match?.[1]?.slice(0, 12) ?? null;
}

/** True when the installed Capgo bundle is not the latest zip (by checksum). */
export function needsWebUpdate(
  currentWebVersion: string,
  remote: MobileLatestManifest,
): boolean {
  const cur = String(currentWebVersion ?? "").trim();
  const target = otaBundleVersion(remote);
  if (!cur || cur === "builtin" || cur === "unknown") return true;
  if (cur === target) return false;
  if (cur === `${target}.retry` || cur.startsWith(`${target}.`)) return false;

  const curChannel = channelDisplayVersion(cur);
  const remoteChannel = channelDisplayVersion(remote.version);
  const curSum = installedChecksumSuffix(cur);
  const remoteSum = otaChecksumSuffix(remote.checksum);

  if (isOlderVersion(remoteChannel, curChannel)) return false;

  // Capgo on iOS often reports plain channel semver after set(), not the -ota hash id.
  if (curChannel === remoteChannel && !curSum) return false;

  if (curChannel === remoteChannel && curSum === remoteSum) return false;

  if (isOlderVersion(curChannel, remoteChannel)) return true;

  if (curChannel === remoteChannel && curSum && curSum !== remoteSum) return true;

  return cur !== target;
}

/** Fallback label when Capgo current() isn't available yet. */
export function bundledAppVersion(): string {
  return APP_VERSION;
}
