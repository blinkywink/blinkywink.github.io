import { Capacitor } from "@capacitor/core";
import { installNativeStaticAssetRewrites } from "./staticAssets";

/** True when running inside Capacitor (iOS/Android native WebView). */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Android WebView — compositing differs from mobile Chrome; use data-platform CSS sparingly. */
export function isAndroidNative(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.platform === "android";
}

/** Resolves once native plugins are configured and Capgo got notifyAppReady. */
export const nativeShellReady: Promise<void> = initNativeShell();

/** Configure status bar / splash / OTA ready once the WebView is ready. */
async function initNativeShell(): Promise<void> {
  if (!isNativeShell()) return;
  installNativeStaticAssetRewrites();
  document.documentElement.dataset.native = "1";
  try {
    document.documentElement.dataset.platform = Capacitor.getPlatform();
  } catch {
    /* ignore */
  }
  /* Capgo set() waits for this after reload — run before React mounts. */
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();
  } catch {
    /* plugin missing / first install */
  }
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0a0a0e" });
  } catch {
    /* plugin missing / web */
  }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
}
