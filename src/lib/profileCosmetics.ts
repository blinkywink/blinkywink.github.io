import type { CSSProperties } from "react";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "./cache";

export const PROFILE_ACCENT_COST = 25_000;
export const PROFILE_ACCENT_CHANGE_COST = 500;

export type ProfileCosmetics = {
  accentUnlocked: boolean;
  accentColor: string | null;
};

export function normalizeAccentColor(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) return null;
  return s.toUpperCase();
}

export function cosmeticsFromProfile(row: {
  accent_unlocked?: boolean | null;
  accent_color?: string | null;
}): ProfileCosmetics {
  return {
    accentUnlocked: Boolean(row.accent_unlocked),
    accentColor: normalizeAccentColor(row.accent_color),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** CSS vars for profile chrome / leaderboard chips / public pages. */
export function playerChromeStyle(input: {
  accentColor?: string | null;
}): CSSProperties {
  const accent = normalizeAccentColor(input.accentColor);
  if (!accent) return {};

  const rgb = hexToRgb(accent);
  return {
    ["--player-accent" as string]: accent,
    ["--player-accent-2" as string]: accent,
    ["--player-accent-r" as string]: String(rgb[0]),
    ["--player-accent-g" as string]: String(rgb[1]),
    ["--player-accent-b" as string]: String(rgb[2]),
  } as CSSProperties;
}

export function hasPlayerChrome(style: CSSProperties): boolean {
  return Boolean((style as Record<string, string>)["--player-accent"]);
}

export async function setProfileAccent(color: string): Promise<number> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to set a profile color.");
  }
  const normalized = normalizeAccentColor(color);
  if (!normalized) throw new Error("Pick a valid color.");

  const { data, error } = await supabase.rpc("set_profile_accent", {
    p_color: normalized,
  });
  if (error) {
    if (/Insufficient coins/i.test(error.message)) {
      throw new Error("Not enough Cash for that color change.");
    }
    throw new Error(error.message);
  }
  cacheInvalidate("profile:");
  return typeof data === "number" ? data : Number(data);
}
