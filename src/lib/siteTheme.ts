/** Site color theme - local cache + account sync when signed in. */

import { loadAppSession, userFacingRpcError } from "../auth/session";
import { cacheInvalidate } from "./cache";
import { getAccessToken, supabase } from "./supabase";

export const PREMIUM_THEME_COST = 5_000;

type SwatchTokens = {
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  glowA: string;
  glowB: string;
  header: string;
  accent: string;
};

/** Mini preview that mirrors the real page + header + accent glow. */
function previewSwatch(t: SwatchTokens): string {
  return [
    `radial-gradient(circle at 18% 0%, ${t.glowA} 0%, transparent 48%)`,
    `radial-gradient(circle at 86% 100%, ${t.glowB} 0%, transparent 48%)`,
    `radial-gradient(circle at 72% 78%, ${t.accent}99 0%, ${t.accent}44 26%, transparent 28%)`,
    `linear-gradient(180deg, ${t.header} 0%, ${t.header} 20%, transparent 20%)`,
    `linear-gradient(180deg, ${t.bgTop} 0%, ${t.bgMid} 52%, ${t.bgBottom} 100%)`,
  ].join(", ");
}

type ThemeDef = {
  id: string;
  label: string;
  tier: "free" | "premium";
  swatch: string;
};

export const SITE_THEMES = [
  {
    id: "midnight",
    label: "Midnight",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#0e0e12",
      bgMid: "#07070a",
      bgBottom: "#050507",
      glowA: "rgba(255, 255, 255, 0.14)",
      glowB: "rgba(255, 255, 255, 0.1)",
      header: "#0a0a0e",
      accent: "#f0c84a",
    }),
  },
  {
    id: "ocean",
    label: "Ocean",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#122840",
      bgMid: "#0a1830",
      bgBottom: "#061020",
      glowA: "rgba(70, 190, 255, 0.62)",
      glowB: "rgba(40, 130, 240, 0.5)",
      header: "#0c1c30",
      accent: "#4ec8ff",
    }),
  },
  {
    id: "forest",
    label: "Forest",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#12301c",
      bgMid: "#0a1c10",
      bgBottom: "#061208",
      glowA: "rgba(80, 230, 120, 0.58)",
      glowB: "rgba(50, 170, 90, 0.46)",
      header: "#0c1c12",
      accent: "#5ee86c",
    }),
  },
  {
    id: "sunset",
    label: "Sunset",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#30180e",
      bgMid: "#1c0c06",
      bgBottom: "#100604",
      glowA: "rgba(255, 150, 70, 0.64)",
      glowB: "rgba(240, 80, 50, 0.5)",
      header: "#201008",
      accent: "#ff9640",
    }),
  },
  {
    id: "grape",
    label: "Grape",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#241430",
      bgMid: "#140a20",
      bgBottom: "#0a0614",
      glowA: "rgba(190, 110, 255, 0.62)",
      glowB: "rgba(140, 70, 230, 0.5)",
      header: "#180e24",
      accent: "#c47aff",
    }),
  },
  {
    id: "crimson",
    label: "Crimson",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#301018",
      bgMid: "#1c0810",
      bgBottom: "#100408",
      glowA: "rgba(255, 80, 120, 0.6)",
      glowB: "rgba(210, 40, 80, 0.48)",
      header: "#1c0a10",
      accent: "#ff5e82",
    }),
  },
  {
    id: "slate",
    label: "Slate",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#1c2434",
      bgMid: "#101620",
      bgBottom: "#080c14",
      glowA: "rgba(160, 185, 225, 0.55)",
      glowB: "rgba(110, 135, 175, 0.42)",
      header: "#121820",
      accent: "#9eb4d8",
    }),
  },
  {
    id: "mint",
    label: "Mint",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#0e2c2a",
      bgMid: "#081c1a",
      bgBottom: "#041210",
      glowA: "rgba(70, 245, 220, 0.58)",
      glowB: "rgba(40, 190, 165, 0.46)",
      header: "#0a1c1a",
      accent: "#4af0d8",
    }),
  },
  {
    id: "amber",
    label: "Amber",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#2c200c",
      bgMid: "#1a1406",
      bgBottom: "#0e0a04",
      glowA: "rgba(255, 210, 50, 0.62)",
      glowB: "rgba(220, 150, 20, 0.5)",
      header: "#181004",
      accent: "#ffd030",
    }),
  },
  {
    id: "rose",
    label: "Rose",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#2c1020",
      bgMid: "#1a0a14",
      bgBottom: "#0e0610",
      glowA: "rgba(255, 110, 190, 0.6)",
      glowB: "rgba(210, 60, 150, 0.48)",
      header: "#1a0c14",
      accent: "#ff7ec4",
    }),
  },
  {
    id: "ice",
    label: "Ice",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#182838",
      bgMid: "#0e1828",
      bgBottom: "#080e18",
      glowA: "rgba(180, 225, 255, 0.62)",
      glowB: "rgba(110, 170, 240, 0.48)",
      header: "#101820",
      accent: "#a8d8ff",
    }),
  },
  {
    id: "ember",
    label: "Ember",
    tier: "free",
    swatch: previewSwatch({
      bgTop: "#30140a",
      bgMid: "#1c0a04",
      bgBottom: "#100402",
      glowA: "rgba(255, 90, 45, 0.64)",
      glowB: "rgba(230, 50, 20, 0.5)",
      header: "#1a0c06",
      accent: "#ff4e28",
    }),
  },
  {
    id: "rgb",
    label: "RGB LED",
    tier: "premium",
    swatch: previewSwatch({
      bgTop: "#1a1020",
      bgMid: "#0c1018",
      bgBottom: "#06080e",
      glowA: "rgba(255, 70, 110, 0.78)",
      glowB: "rgba(60, 150, 255, 0.72)",
      header: "#0c0c14",
      accent: "#5bff9a",
    }),
  },
  {
    id: "neon",
    label: "Neon",
    tier: "premium",
    swatch: previewSwatch({
      bgTop: "#061812",
      bgMid: "#020c08",
      bgBottom: "#010604",
      glowA: "rgba(57, 255, 20, 0.85)",
      glowB: "rgba(255, 20, 200, 0.7)",
      header: "#04140e",
      accent: "#39ff14",
    }),
  },
  {
    id: "lava",
    label: "Lava",
    tier: "premium",
    swatch: previewSwatch({
      bgTop: "#2a0a04",
      bgMid: "#140402",
      bgBottom: "#080200",
      glowA: "rgba(255, 110, 20, 0.88)",
      glowB: "rgba(255, 30, 10, 0.7)",
      header: "#180604",
      accent: "#ff6a18",
    }),
  },
  {
    id: "toxic",
    label: "Toxic",
    tier: "premium",
    swatch: previewSwatch({
      bgTop: "#142006",
      bgMid: "#0a1202",
      bgBottom: "#040800",
      glowA: "rgba(210, 255, 40, 0.85)",
      glowB: "rgba(140, 255, 20, 0.65)",
      header: "#0e1604",
      accent: "#d2ff28",
    }),
  },
  {
    id: "vapor",
    label: "Vapor",
    tier: "premium",
    swatch: previewSwatch({
      bgTop: "#201028",
      bgMid: "#100818",
      bgBottom: "#080410",
      glowA: "rgba(255, 90, 220, 0.85)",
      glowB: "rgba(60, 230, 255, 0.75)",
      header: "#160c1c",
      accent: "#ff5ad8",
    }),
  },
  {
    id: "aurora",
    label: "Aurora",
    tier: "premium",
    swatch: previewSwatch({
      bgTop: "#061828",
      bgMid: "#041018",
      bgBottom: "#02080e",
      glowA: "rgba(40, 255, 190, 0.82)",
      glowB: "rgba(130, 80, 255, 0.7)",
      header: "#061420",
      accent: "#2affb0",
    }),
  },
  {
    id: "gold",
    label: "Gold",
    tier: "premium",
    swatch: previewSwatch({
      bgTop: "#241c08",
      bgMid: "#141004",
      bgBottom: "#0a0802",
      glowA: "rgba(255, 210, 70, 0.88)",
      glowB: "rgba(255, 160, 40, 0.7)",
      header: "#181204",
      accent: "#ffd24a",
    }),
  },
  {
    id: "void",
    label: "Void",
    tier: "premium",
    swatch: previewSwatch({
      bgTop: "#0c0618",
      bgMid: "#06020e",
      bgBottom: "#020106",
      glowA: "rgba(120, 70, 255, 0.85)",
      glowB: "rgba(30, 180, 255, 0.7)",
      header: "#080412",
      accent: "#7a52ff",
    }),
  },
] as const satisfies readonly ThemeDef[];

export type SiteThemeId = (typeof SITE_THEMES)[number]["id"];

export const FREE_SITE_THEMES = SITE_THEMES.filter((t) => t.tier === "free");
export const PREMIUM_SITE_THEMES = SITE_THEMES.filter(
  (t) => t.tier === "premium",
);

export const PREMIUM_THEME_IDS: ReadonlySet<string> = new Set(
  PREMIUM_SITE_THEMES.map((t) => t.id),
);

const STORAGE_KEY = "monkeycards.siteTheme";
const DEFAULT_ID: SiteThemeId = "midnight";

const listeners = new Set<(id: SiteThemeId) => void>();

function isSiteThemeId(value: string): value is SiteThemeId {
  return SITE_THEMES.some((t) => t.id === value);
}

export function isPremiumTheme(id: string): boolean {
  return PREMIUM_THEME_IDS.has(id);
}

export function isFreeTheme(id: string): boolean {
  return isSiteThemeId(id) && !isPremiumTheme(id);
}

export function parseUnlockedThemes(raw: unknown): SiteThemeId[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteThemeId[] = [];
  for (const item of raw) {
    const id = String(item ?? "").trim().toLowerCase();
    if (isSiteThemeId(id) && isPremiumTheme(id) && !out.includes(id)) {
      out.push(id);
    }
  }
  return out;
}

export function themeUnlockedFromProfile(
  id: SiteThemeId,
  row?: { site_themes_unlocked?: string[] | null } | null,
): boolean {
  if (!isPremiumTheme(id)) return true;
  return parseUnlockedThemes(row?.site_themes_unlocked).includes(id);
}

function readStored(): SiteThemeId {
  if (typeof window === "undefined") return DEFAULT_ID;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isSiteThemeId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ID;
}

let current = readStored();

export function getSiteThemeId(): SiteThemeId {
  return current;
}

export function siteThemeById(id: SiteThemeId = current) {
  return SITE_THEMES.find((t) => t.id === id) ?? SITE_THEMES[0];
}

export function applySiteTheme(id: SiteThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.siteTheme = id;
  // index.html used to set inline `background`, which blocked the themed page
  // gradient so only the header appeared to change.
  for (const el of [document.documentElement, document.body]) {
    el?.style.removeProperty("background");
    el?.style.removeProperty("background-color");
  }
}

function writeLocalTheme(id: SiteThemeId): void {
  current = id;
  applySiteTheme(id);
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn(current);
}

export function setSiteThemeId(next: SiteThemeId): void {
  if (!isSiteThemeId(next)) return;
  writeLocalTheme(next);
}

/** Apply a theme stored on the signed-in account. */
export function syncSiteThemeFromServer(raw: unknown): void {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!isSiteThemeId(value)) return;
  if (value === current) {
    applySiteTheme(value);
    return;
  }
  writeLocalTheme(value);
}

/** Persist the pick to the account. Returns an error message, or null on success. */
export async function saveSiteThemeToServer(
  id: SiteThemeId,
): Promise<string | null> {
  if (!isSiteThemeId(id)) return "Invalid theme.";
  if (!getAccessToken() || !loadAppSession()) return null;

  const { error } = await supabase.rpc("set_site_theme", { p_theme: id });
  if (error) {
    console.warn("save site theme failed", error.message);
    if (/not unlocked/i.test(error.message)) {
      return "Unlock that theme first.";
    }
    if (/Insufficient coins/i.test(error.message)) {
      return "Not enough Cash.";
    }
    if (/set_site_theme/i.test(error.message)) {
      return "Could not save theme to your account yet. Try again in a moment.";
    }
    return userFacingRpcError(error);
  }
  return null;
}

/** Buy a premium theme (5 000 Cash). Returns new balance. */
export async function buySiteTheme(id: SiteThemeId): Promise<number> {
  if (!isPremiumTheme(id)) {
    throw new Error("That theme is free.");
  }
  if (!getAccessToken() || !loadAppSession()) {
    throw new Error("Sign in to unlock themes.");
  }

  const { data, error } = await supabase.rpc("buy_site_theme", {
    p_theme: id,
  });
  if (error) {
    if (/Insufficient coins/i.test(error.message)) {
      throw new Error("Not enough Cash for that theme.");
    }
    if (/already unlocked/i.test(error.message)) {
      throw new Error("You already own that theme.");
    }
    throw new Error(userFacingRpcError(error, "Sign in to unlock themes."));
  }
  cacheInvalidate("profile:");
  return typeof data === "number" ? data : Number(data);
}

/**
 * On sign-in: apply server theme when present; otherwise upload this device's pick.
 */
export async function reconcileSiteThemeWithAccount(
  serverRaw: unknown,
): Promise<void> {
  const server = String(serverRaw ?? "").trim().toLowerCase();
  if (isSiteThemeId(server)) {
    syncSiteThemeFromServer(server);
    return;
  }
  if (!getAccessToken() || !loadAppSession()) return;
  const local = getSiteThemeId();
  if (isPremiumTheme(local)) {
    // Don't push a premium pick the account may not own yet.
    return;
  }
  await saveSiteThemeToServer(local);
}

export function subscribeSiteTheme(fn: (id: SiteThemeId) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Call once before first paint when possible. */
export function initSiteTheme(): void {
  current = readStored();
  applySiteTheme(current);
}
