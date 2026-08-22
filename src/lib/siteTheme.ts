/** Site color theme — local cache + account sync when signed in. */

import { loadAppSession } from "../auth/session";
import { getAccessToken, supabase } from "./supabase";

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
    `radial-gradient(circle at 18% 0%, ${t.glowA} 0%, transparent 46%)`,
    `radial-gradient(circle at 86% 100%, ${t.glowB} 0%, transparent 46%)`,
    `radial-gradient(circle at 72% 78%, ${t.accent}55 0%, ${t.accent}22 22%, transparent 24%)`,
    `linear-gradient(180deg, ${t.header} 0%, ${t.header} 20%, transparent 20%)`,
    `linear-gradient(180deg, ${t.bgTop} 0%, ${t.bgMid} 52%, ${t.bgBottom} 100%)`,
  ].join(", ");
}

export const SITE_THEMES = [
  {
    id: "midnight",
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
    swatch: previewSwatch({
      bgTop: "#0e1824",
      bgMid: "#081018",
      bgBottom: "#040810",
      glowA: "rgba(80, 180, 255, 0.38)",
      glowB: "rgba(40, 120, 220, 0.32)",
      header: "#081018",
      accent: "#5ec8ff",
    }),
  },
  {
    id: "forest",
    swatch: previewSwatch({
      bgTop: "#0e1a12",
      bgMid: "#071008",
      bgBottom: "#040806",
      glowA: "rgba(90, 210, 120, 0.34)",
      glowB: "rgba(50, 140, 80, 0.28)",
      header: "#071008",
      accent: "#6fd87a",
    }),
  },
  {
    id: "sunset",
    swatch: previewSwatch({
      bgTop: "#1a100c",
      bgMid: "#100804",
      bgBottom: "#080402",
      glowA: "rgba(255, 160, 80, 0.4)",
      glowB: "rgba(220, 90, 60, 0.3)",
      header: "#140a06",
      accent: "#ff9a4a",
    }),
  },
  {
    id: "grape",
    swatch: previewSwatch({
      bgTop: "#140c1a",
      bgMid: "#0a0610",
      bgBottom: "#050308",
      glowA: "rgba(180, 100, 255, 0.38)",
      glowB: "rgba(120, 60, 200, 0.3)",
      header: "#0c0612",
      accent: "#c88cff",
    }),
  },
  {
    id: "crimson",
    swatch: previewSwatch({
      bgTop: "#1a0810",
      bgMid: "#100408",
      bgBottom: "#080204",
      glowA: "rgba(255, 90, 120, 0.36)",
      glowB: "rgba(180, 40, 70, 0.28)",
      header: "#100408",
      accent: "#ff6b88",
    }),
  },
  {
    id: "slate",
    swatch: previewSwatch({
      bgTop: "#141820",
      bgMid: "#0a0c10",
      bgBottom: "#050608",
      glowA: "rgba(148, 168, 200, 0.32)",
      glowB: "rgba(90, 110, 140, 0.26)",
      header: "#0a0c10",
      accent: "#94a8c8",
    }),
  },
  {
    id: "mint",
    swatch: previewSwatch({
      bgTop: "#0a1818",
      bgMid: "#060e0e",
      bgBottom: "#030808",
      glowA: "rgba(94, 234, 212, 0.34)",
      glowB: "rgba(40, 160, 140, 0.28)",
      header: "#060e0e",
      accent: "#5eead4",
    }),
  },
  {
    id: "amber",
    swatch: previewSwatch({
      bgTop: "#181008",
      bgMid: "#0c0804",
      bgBottom: "#060402",
      glowA: "rgba(255, 210, 63, 0.38)",
      glowB: "rgba(200, 140, 30, 0.3)",
      header: "#0e0a04",
      accent: "#ffd23f",
    }),
  },
  {
    id: "rose",
    swatch: previewSwatch({
      bgTop: "#180810",
      bgMid: "#0c0408",
      bgBottom: "#060204",
      glowA: "rgba(255, 120, 190, 0.36)",
      glowB: "rgba(180, 60, 130, 0.28)",
      header: "#0e060a",
      accent: "#ff8ec8",
    }),
  },
  {
    id: "ice",
    swatch: previewSwatch({
      bgTop: "#101820",
      bgMid: "#080c12",
      bgBottom: "#040608",
      glowA: "rgba(184, 220, 255, 0.38)",
      glowB: "rgba(100, 150, 210, 0.3)",
      header: "#080c12",
      accent: "#b8dcff",
    }),
  },
  {
    id: "ember",
    swatch: previewSwatch({
      bgTop: "#1a0c06",
      bgMid: "#100602",
      bgBottom: "#080302",
      glowA: "rgba(255, 85, 51, 0.4)",
      glowB: "rgba(200, 50, 20, 0.32)",
      header: "#100602",
      accent: "#ff5533",
    }),
  },
] as const;

export type SiteThemeId = (typeof SITE_THEMES)[number]["id"];

const STORAGE_KEY = "monkeycards.siteTheme";
const DEFAULT_ID: SiteThemeId = "midnight";

const listeners = new Set<(id: SiteThemeId) => void>();

function isSiteThemeId(value: string): value is SiteThemeId {
  return SITE_THEMES.some((t) => t.id === value);
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
    if (/set_site_theme/i.test(error.message)) {
      return "Could not save theme to your account yet. Try again in a moment.";
    }
    return error.message;
  }
  return null;
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
  await saveSiteThemeToServer(getSiteThemeId());
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
