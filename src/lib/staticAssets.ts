import { isNativeShell } from "./nativeShell";

/** Canonical static host — use www to avoid 308 redirects during Capgo downloads. */
export const STATIC_ASSET_ORIGIN = "https://www.monkeycards.app";

/** On native, load media from the live site when the OTA bundle lacks static files. */
export function staticAssetUrl(path: string): string {
  const src = String(path ?? "").trim();
  if (!src.startsWith("/")) return src;
  if (!isNativeShell()) return src;
  return `${STATIC_ASSET_ORIGIN}${src}`;
}
