/** Mobile OTA / force-redownload signals (Capacitor sideload shells). */

import { isOlderVersion } from "./desktopDownloads";
import { getAppliedOtaChecksum } from "./mobileOtaGuard";
import { MIN_NATIVE_VERSION, MOBILE_NATIVE_VERSION } from "./mobileNativeVersion";

/** Public installer links — proxied off github.com so players aren't asked to sign in. */
export const INSTALLER_DOWNLOAD_BASE = "https://api.blinkywink.co/downloads";

export const MOBILE_APK_URL = `${INSTALLER_DOWNLOAD_BASE}/MonkeyCards.apk`;
export const MOBILE_IPA_URL = `${INSTALLER_DOWNLOAD_BASE}/MonkeyCards.ipa`;
export const MOBILE_RELEASE_PAGE =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest";

export type MobileLatestManifest = {
  version: string;
  minNativeVersion: string;
  /** Direct Capgo zip (JS/CSS only). */
  url: string;
  /** sha256 of the zip. */
  checksum: string;
  message?: string;
};

const MANIFEST_SOURCES = [
  "https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/mobile-latest.json",
  "https://monkeycards.pages.dev/mobile-latest.json",
  "https://raw.githubusercontent.com/blinkywink/blinkywink.github.io/main/public/mobile-latest.json",
];

export async function fetchMobileLatestManifest(): Promise<MobileLatestManifest | null> {
  for (const url of MANIFEST_SOURCES) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        version?: string;
        minNativeVersion?: string;
        url?: string;
        checksum?: string;
        message?: string;
      };
      const version = String(data.version ?? "").trim();
      const zipUrl = String(data.url ?? "").trim();
      const checksum = String(data.checksum ?? "").trim().toLowerCase();
      if (!version || !zipUrl || !/^[a-f0-9]{64}$/.test(checksum)) continue;
      if (!/MonkeyCards-web/i.test(zipUrl) && !zipUrl.endsWith(".zip")) {
        continue;
      }
      return {
        version,
        minNativeVersion:
          String(data.minNativeVersion ?? "").trim() || MIN_NATIVE_VERSION,
        url: zipUrl,
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

export function otaChecksumSuffix(checksum: string): string {
  return checksum.replace(/[^a-f0-9]/gi, "").slice(0, 12);
}

export function otaBundleVersion(remote: MobileLatestManifest): string {
  const sum = otaChecksumSuffix(remote.checksum);
  const base = remote.version.split("+")[0]!.split("-ota.")[0]!;
  return sum ? `${base}-ota.${sum}` : base;
}

function installedChecksumSuffix(installed: string): string | null {
  const match = installed.match(/-ota\.([a-f0-9]+)/i);
  return match?.[1]?.slice(0, 12) ?? null;
}

export function isBuiltinWebBundle(currentWebVersion: string): boolean {
  const cur = String(currentWebVersion ?? "").trim().toLowerCase();
  return !cur || cur === "builtin" || cur === "unknown";
}

export async function fetchBakedOtaChecksum(): Promise<string | null> {
  try {
    const res = await fetch(`/ota-checksum.txt?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const sum = otaChecksumSuffix(await res.text());
    return sum || null;
  } catch {
    return null;
  }
}

export function needsWebUpdate(
  currentWebVersion: string,
  remote: MobileLatestManifest,
  bakedChecksum?: string | null,
): boolean {
  const cur = String(currentWebVersion ?? "").trim();
  const target = otaBundleVersion(remote);
  const remoteSum = otaChecksumSuffix(remote.checksum);

  if (isBuiltinWebBundle(cur)) {
    const baked = otaChecksumSuffix(String(bakedChecksum ?? ""));
    return !(baked && remoteSum && baked === remoteSum);
  }

  if (cur === target) return false;
  if (cur === `${target}.retry` || cur.startsWith(`${target}.`)) return false;

  const curSum =
    installedChecksumSuffix(cur) ?? getAppliedOtaChecksum() ?? null;
  if (remoteSum && curSum === remoteSum) return false;
  return cur !== target;
}

export function bundledAppVersion(): string {
  return MOBILE_NATIVE_VERSION;
}
