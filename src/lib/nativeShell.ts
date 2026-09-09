import { Capacitor } from "@capacitor/core";
import { installSoftKeyboardState } from "./softKeyboard";

/** True when running inside Capacitor (iOS/Android native WebView). */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Android WebView — prefer the same card CSS as mobile web; use data-platform only for shell/perf. */
export function isAndroidNative(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.platform === "android";
}

/** Resolves once native plugins are configured and Capgo got notifyAppReady. */
export const nativeShellReady: Promise<void> = initNativeShell();

/** Configure status bar / splash / OTA ready once the WebView is ready. */
async function initNativeShell(): Promise<void> {
  if (!isNativeShell()) return;
  installSoftKeyboardState();
  document.documentElement.dataset.native = "1";
  try {
    document.documentElement.dataset.platform = Capacitor.getPlatform();
  } catch {
    /* ignore */
  }
  installIosOverscrollGuard();
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

function nestedCanScroll(target: EventTarget | null, dy: number): boolean {
  let el = target instanceof Element ? target.parentElement : null;
  while (el) {
    if (el instanceof HTMLElement) {
      const oy = getComputedStyle(el).overflowY;
      const scrollable = oy === "auto" || oy === "scroll" || oy === "overlay";
      if (scrollable && el.scrollHeight > el.clientHeight + 1) {
        if (dy > 0 && el.scrollTop > 0) return true;
        if (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) {
          return true;
        }
      }
    }
    el = el.parentElement;
  }
  return false;
}

/** Stop iOS rubber-band from reloading the WKWebView on a fast flick. */
function installIosOverscrollGuard(): void {
  const ios =
    document.documentElement.dataset.platform === "ios" ||
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!ios) return;
  const flag = window as Window & { __iosOverscrollGuard?: boolean };
  if (flag.__iosOverscrollGuard) return;
  flag.__iosOverscrollGuard = true;

  let startY = 0;
  document.addEventListener(
    "touchstart",
    (e) => {
      startY = e.touches[0]?.clientY ?? 0;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY;
      if (nestedCanScroll(e.target, dy)) return;
      const scroller = document.querySelector(".site-main");
      const node = scroller instanceof HTMLElement ? scroller : null;
      if (!node) return;
      const atTop = node.scrollTop <= 0;
      const atBottom =
        node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
      if ((atTop && dy > 0) || (atBottom && dy < 0)) {
        e.preventDefault();
      }
    },
    { passive: false },
  );
}
