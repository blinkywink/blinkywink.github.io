/** Mobile OTA / force-redownload signals (Capacitor sideload shells). */

import { APP_VERSION } from "./appVersion";
import { isOlderVersion } from "./desktopDownloads";

export const MOBILE_APK_URL =
  "https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/MonkeyCards.apk";
export const MOBILE_IPA_URL =
  "https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/MonkeyCards.ipa";
export const MOBILE_RELEASE_PAGE =
  "https://github.com/blinkywink/blinkywink.github.io/releases/tag/mobile";

export type MobileLatestManifest = {
  /** Latest web bundle version (OTA). */
  version: string;
  /** Minimum native APK/IPA version that can run this web (or any OTA). */
  minNativeVersion: string;
  /** Zip of `dist/` for Capgo updater. */
  url: string;
  /** sha256 hex of the zip. */
  checksum: string;
  message?: string;
};

const MANIFEST_URLS = [
  "https://blinkywink.github.io/mobile-latest.json",
  "https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/mobile-latest.json",
];

export async function fetchMobileLatestManifest(): Promise<MobileLatestManifest | null> {
  for (const base of MANIFEST_URLS) {
    try {
      const res = await fetch(`${base}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as Partial<MobileLatestManifest>;
      const version = String(data.version ?? "").trim();
      const minNativeVersion = String(data.minNativeVersion ?? "").trim();
      const url = String(data.url ?? "").trim();
      const checksum = String(data.checksum ?? "").trim();
      if (!version || !minNativeVersion || !url) continue;
      return {
        version,
        minNativeVersion,
        url,
        checksum,
        message: data.message ? String(data.message) : undefined,
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

export function needsNativeRedownload(
  nativeVersion: string,
  remote: MobileLatestManifest,
): boolean {
  return isOlderVersion(nativeVersion, remote.minNativeVersion);
}

export function needsWebUpdate(
  currentWebVersion: string,
  remote: MobileLatestManifest,
): boolean {
  return isOlderVersion(currentWebVersion, remote.version);
}

/** Fallback label when Capgo current() isn't available yet. */
export function bundledAppVersion(): string {
  return APP_VERSION;
}
