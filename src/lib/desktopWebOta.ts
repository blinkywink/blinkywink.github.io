/** Desktop slim web OTA — same zip/manifest as Capgo mobile. */

import { invoke } from "@tauri-apps/api/core";
import {
  fetchBakedOtaChecksum,
  fetchMobileLatestManifest,
  needsWebUpdate,
  otaBundleVersion,
  otaChecksumSuffix,
  type MobileLatestManifest,
} from "./mobileUpdates";

export type DesktopWebOtaStatus = {
  version: string;
  checksum: string;
};

export async function desktopWebOtaStatus(): Promise<DesktopWebOtaStatus | null> {
  try {
    return await invoke<DesktopWebOtaStatus | null>("desktop_web_ota_status");
  } catch (err) {
    console.warn("desktop_web_ota_status failed", err);
    return null;
  }
}

export async function desktopWebOtaApply(
  manifest: MobileLatestManifest,
): Promise<DesktopWebOtaStatus> {
  return invoke<DesktopWebOtaStatus>("desktop_web_ota_apply", {
    args: {
      url: manifest.url,
      checksum: manifest.checksum,
      version: otaBundleVersion(manifest),
    },
  });
}

export async function desktopWebOtaReload(): Promise<void> {
  await invoke("desktop_web_ota_reload");
}

/** Current web bundle id for needsWebUpdate (builtin or applied OTA version). */
export async function desktopCurrentWebVersion(): Promise<{
  currentWeb: string;
  baked: string | null;
}> {
  const [status, baked] = await Promise.all([
    desktopWebOtaStatus(),
    fetchBakedOtaChecksum(),
  ]);
  if (status?.version) {
    return { currentWeb: status.version, baked };
  }
  if (status?.checksum) {
    const sum = otaChecksumSuffix(status.checksum);
    return {
      currentWeb: sum ? `builtin-ota.${sum}` : "builtin",
      baked,
    };
  }
  return { currentWeb: "builtin", baked };
}

export async function desktopNeedsWebOta(): Promise<{
  needed: boolean;
  manifest: MobileLatestManifest | null;
}> {
  const manifest = await fetchMobileLatestManifest();
  if (!manifest) return { needed: false, manifest: null };
  const { currentWeb, baked } = await desktopCurrentWebVersion();
  return {
    needed: needsWebUpdate(currentWeb, manifest, baked),
    manifest,
  };
}
