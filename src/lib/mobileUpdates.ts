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
  /** Zip of `dist/` for Capgo updater. */
  url: string;
  /** sha256 hex of the zip. */
  checksum: string;
  message?: string;
};

const MANIFEST_URLS = [
  "https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/mobile-latest.json",
  "https://blinkywink.github.io/public/mobile-latest.json",
  "https://blinkywink.github.io/mobile-latest.json",
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

/**
 * Capgo bundle id — unique per zip checksum so hotfixes can ship without
 * changing the user-facing APP_VERSION.
 */
export function otaBundleVersion(remote: MobileLatestManifest): string {
  const sum = remote.checksum.replace(/[^a-f0-9]/gi, "").slice(0, 12);
  const base = remote.version.split("+")[0]!.split("-ota.")[0]!;
  return sum ? `${base}-ota.${sum}` : base;
}

function channelDisplayVersion(installed: string): string {
  return (
    installed.split("+")[0]?.split("-ota.")[0]?.trim() || installed.trim()
  );
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
  // Legacy clients / older Capgo ids: pull when channel semver is ahead.
  const display = channelDisplayVersion(cur);
  if (isOlderVersion(display, remote.version)) return true;
  // Hotfix: same channel label, different zip (or rolled-back display version).
  return cur !== target;
}

/** Fallback label when Capgo current() isn't available yet. */
export function bundledAppVersion(): string {
  return APP_VERSION;
}
