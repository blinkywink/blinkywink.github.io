/** Where the site logo in the header goes. Saved on this device only. */

export const LOGO_HOME_PAGES = [
  { id: "home", path: "/", label: "Home" },
  { id: "games", path: "/games", label: "Games" },
  { id: "shop", path: "/shop", label: "Shop" },
  { id: "cards", path: "/collection", label: "Cards" },
  { id: "market", path: "/marketplace", label: "Market" },
  { id: "leaderboard", path: "/leaderboard", label: "Leaderboard" },
] as const;

export type LogoHomeId = (typeof LOGO_HOME_PAGES)[number]["id"];

const STORAGE_KEY = "bloon.logoHome";
const DEFAULT_ID: LogoHomeId = "home";

const listeners = new Set<(id: LogoHomeId) => void>();

function isLogoHomeId(value: string): value is LogoHomeId {
  return LOGO_HOME_PAGES.some((p) => p.id === value);
}

function readStored(): LogoHomeId {
  if (typeof window === "undefined") return DEFAULT_ID;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isLogoHomeId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ID;
}

let current = readStored();

export function getLogoHomeId(): LogoHomeId {
  return current;
}

export function logoHomePage(id: LogoHomeId = current) {
  return LOGO_HOME_PAGES.find((p) => p.id === id) ?? LOGO_HOME_PAGES[0];
}

export function setLogoHomeId(next: LogoHomeId): void {
  if (!isLogoHomeId(next)) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn(current);
}

export function subscribeLogoHome(fn: (id: LogoHomeId) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
