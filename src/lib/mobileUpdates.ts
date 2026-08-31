/** Mobile OTA / force-redownload signals (Capacitor sideload shells). */

import { isOlderVersion } from "./desktopDownloads";
import { getAppliedOtaChecksum } from "./mobileOtaGuard";
import { MOBILE_NATIVE_VERSION } from "./mobileNativeVersion";

export const MOBILE_APK_URL =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/MonkeyCards.apk";
export const MOBILE_IPA_URL =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/MonkeyCards.ipa";
export const MOBILE_RELEASE_PAGE =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest";

export type OtaManifestEntry = {
  file_name: string;
  file_hash: string;
  download_url: string;
};

export type MobileLatestManifest = {
  /** Latest web bundle version (OTA). */
  version: string;
  /** Minimum native APK/IPA version that can run this web (or any OTA). */
  minNativeVersion: string;
  /** Legacy full-zip URL (unused when `manifest` is present). */
  url: string;
  /** sha256 hex of the bundle or manifest fingerprint. */
  checksum: string;
  /** Per-file delta update — only changed JS/CSS is downloaded. */
  manifest?: OtaManifestEntry[];
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
        const manifest = Array.isArray(data.manifest)
          ? data.manifest
              .map((entry) => ({
                file_name: String(entry?.file_name ?? "").trim(),
                file_hash: String(entry?.file_hash ?? "").trim(),
                download_url: String(entry?.download_url ?? "").trim(),
              }))
              .filter(
                (entry) =>
                  entry.file_name && entry.file_hash && entry.download_url,
              )
          : undefined;
        if (!version || !minNativeVersion) return;
        if (!manifest?.length && !manifestUrl) return;
        if (!checksum) return;
        found.push({
          rank,
          manifest: {
            version,
            minNativeVersion,
            url: manifestUrl,
            checksum,
            manifest,
            message: data.message ? String(data.message) : undefined,
          },
        });
      } catch {
        /* try next */
      }
    }),
  );

  if (found.length === 0) return null;

  /* GitHub release is source of truth — don't let a stale 1.0.61 mirror win. */
  return found.reduce((best, cur) =>
    cur.rank > best.rank ? cur : best,
  ).manifest;
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

export function isBuiltinWebBundle(currentWebVersion: string): boolean {
  const cur = String(currentWebVersion ?? "").trim().toLowerCase();
  return !cur || cur === "builtin" || cur === "unknown";
}

/** Checksum baked into this IPA/APK at build time (`/ota-checksum.txt`). */
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

/** True when the installed Capgo bundle is not the latest zip (by checksum). */
export function needsWebUpdate(
  currentWebVersion: string,
  remote: MobileLatestManifest,
  bakedChecksum?: string | null,
): boolean {
  const cur = String(currentWebVersion ?? "").trim();
  const target = otaBundleVersion(remote);
  const remoteSum = otaChecksumSuffix(remote.checksum);

  // Capgo reports a fresh IPA as "builtin". The old OTA channel (1.0.61) was
  // always ahead of APP_VERSION, so semver forced a full-site copy. Compare
  // baked checksums only; the gate never auto-OTAs builtin.
  if (isBuiltinWebBundle(cur)) {
    const baked = otaChecksumSuffix(String(bakedChecksum ?? ""));
    return !(baked && remoteSum && baked === remoteSum);
  }

  if (cur === target) return false;
  if (cur === `${target}.retry` || cur.startsWith(`${target}.`)) return false;

  const curSum =
    installedChecksumSuffix(cur) ?? getAppliedOtaChecksum() ?? null;
  if (remoteSum && curSum === remoteSum) return false;
  if (remoteSum && curSum && curSum !== remoteSum) return true;

  const curChannel = channelDisplayVersion(cur);
  const remoteChannel = channelDisplayVersion(remote.version);
  if (isOlderVersion(remoteChannel, curChannel)) return false;
  if (isOlderVersion(curChannel, remoteChannel)) return true;

  return cur !== target;
}

/** Fallback label when Capgo current() isn't available yet. */
export function bundledAppVersion(): string {
  return MOBILE_NATIVE_VERSION;
}
