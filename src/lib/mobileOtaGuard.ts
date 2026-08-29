/** Prevent Capgo OTA reload loops after failed installs. */

const FAIL_KEY = "bloon-arcade:ota-fail";
const SKIP_KEY = "bloon-arcade:ota-skip";
const APPLIED_CHECKSUM_KEY = "bloon-arcade:ota-applied-checksum";
const AUTO_FAIL_COOLDOWN_MS = 30 * 60_000;

type OtaFailRecord = { version: string; at: number };

function readFail(): OtaFailRecord | null {
  try {
    const raw = sessionStorage.getItem(FAIL_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<OtaFailRecord>;
    const version = String(data.version ?? "").trim();
    const at = Number(data.at);
    if (!version || !Number.isFinite(at)) return null;
    return { version, at };
  } catch {
    return null;
  }
}

function readSkipVersion(): string | null {
  try {
    const v = sessionStorage.getItem(SKIP_KEY);
    return v ? String(v).trim() : null;
  } catch {
    return null;
  }
}

/** User chose to play without installing this OTA bundle. */
export function skipMobileOta(version: string) {
  try {
    sessionStorage.setItem(SKIP_KEY, version.trim());
  } catch {
    /* ignore */
  }
}

export function clearMobileOtaSkip() {
  try {
    sessionStorage.removeItem(SKIP_KEY);
  } catch {
    /* ignore */
  }
}

/** Remember a failed install so we don't auto-retry into a crash loop. */
export function recordMobileOtaFailure(version: string) {
  try {
    const payload: OtaFailRecord = { version: version.trim(), at: Date.now() };
    sessionStorage.setItem(FAIL_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearMobileOtaFailure() {
  try {
    sessionStorage.removeItem(FAIL_KEY);
  } catch {
    /* ignore */
  }
}

/** Remember the manifest checksum we successfully applied (Capgo may report bare semver). */
export function markMobileOtaApplied(checksumSuffix: string) {
  const sum = checksumSuffix.replace(/[^a-f0-9]/gi, "").slice(0, 12);
  if (!sum) return;
  try {
    localStorage.setItem(APPLIED_CHECKSUM_KEY, sum);
  } catch {
    /* ignore */
  }
}

export function getAppliedOtaChecksum(): string | null {
  try {
    const v = localStorage.getItem(APPLIED_CHECKSUM_KEY);
    return v ? String(v).trim() : null;
  } catch {
    return null;
  }
}

/** Auto OTA only when we haven't recently failed or skipped this bundle id. */
export function shouldAutoInstallMobileOta(bundleVersion: string): boolean {
  const target = bundleVersion.trim();
  if (!target) return false;

  const skipped = readSkipVersion();
  if (skipped && skipped === target) return false;

  const fail = readFail();
  if (!fail || fail.version !== target) return true;
  return Date.now() - fail.at >= AUTO_FAIL_COOLDOWN_MS;
}
