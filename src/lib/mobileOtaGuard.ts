/** Remember which OTA zip we successfully applied. */

const APPLIED_CHECKSUM_KEY = "bloon-arcade:ota-applied-checksum";

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
