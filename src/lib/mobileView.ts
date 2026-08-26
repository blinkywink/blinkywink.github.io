/** Mobile chrome: classic top bar vs modern bottom-nav app shell. Device only. */

export const MOBILE_VIEW_OPTIONS = [
  { id: "modern", label: "Modern" },
  { id: "classic", label: "Classic" },
] as const;

export type MobileViewId = (typeof MOBILE_VIEW_OPTIONS)[number]["id"];

const STORAGE_KEY = "bloon.mobileView";
const DEFAULT_ID: MobileViewId = "modern";

const listeners = new Set<(id: MobileViewId) => void>();

function isMobileViewId(value: string): value is MobileViewId {
  return MOBILE_VIEW_OPTIONS.some((o) => o.id === value);
}

function readStored(): MobileViewId {
  if (typeof window === "undefined") return DEFAULT_ID;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isMobileViewId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ID;
}

let current = readStored();

export function getMobileViewId(): MobileViewId {
  return current;
}

export function setMobileViewId(next: MobileViewId): void {
  if (!isMobileViewId(next)) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn(current);
}

export function subscribeMobileView(fn: (id: MobileViewId) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Main hub routes that show the modern bottom tab bar. */
export function showsMobileAppNav(pathname: string): boolean {
  if (pathname === "/" || pathname === "/about" || pathname === "/profile") {
    return true;
  }
  if (pathname === "/games" || pathname.startsWith("/games/")) return true;
  if (pathname === "/shop" || pathname.startsWith("/shop/")) return true;
  if (pathname === "/collection" || pathname.startsWith("/collection/")) {
    return true;
  }
  if (pathname === "/marketplace" || pathname.startsWith("/marketplace/")) {
    return true;
  }
  if (pathname === "/leaderboard") return true;
  if (pathname.startsWith("/user/")) return true;
  if (pathname.startsWith("/trade/")) return true;
  if (pathname === "/profile/paragon-lab") return true;
  return false;
}

export function isShopPath(pathname: string): boolean {
  return pathname === "/shop" || pathname.startsWith("/shop/");
}
