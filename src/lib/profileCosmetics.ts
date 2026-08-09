import type { CSSProperties } from "react";
import cardAccents from "../data/cardAccents.json";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "./cache";
import { cardSpecById } from "./cardCatalog";
import {
  maxPathTier,
  pathLevelsFromEntity,
  type PathLevels,
} from "./pathCombos";

export const PROFILE_ACCENT_COST = 25_000;
export const PROFILE_AURA_COST = 50_000;

type AccentJson = {
  primary: string;
  secondary: string;
  colors?: string[];
  rgb: [number, number, number];
};

const accents = cardAccents as unknown as Record<string, AccentJson>;

const PARAGON_ACCENT = {
  primary: "#0f7dfe",
  secondary: "#b401fe",
  rgb: [15, 125, 254] as [number, number, number],
  colors: [
    "#0f7dfe",
    "#b401fe",
    "#7d01fe",
    "#3400fe",
    "#10388f",
    "#0f205c",
    "#5ef0ff",
    "#e9d5ff",
  ],
};

export type ProfileCosmetics = {
  accentUnlocked: boolean;
  accentColor: string | null;
  auraUnlocked: boolean;
  auraCardId: string | null;
};

export function normalizeAccentColor(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) return null;
  return s.toUpperCase();
}

export function cosmeticsFromProfile(row: {
  accent_unlocked?: boolean | null;
  accent_color?: string | null;
  aura_unlocked?: boolean | null;
  aura_card_id?: string | null;
}): ProfileCosmetics {
  return {
    accentUnlocked: Boolean(row.accent_unlocked),
    accentColor: normalizeAccentColor(row.accent_color),
    auraUnlocked: Boolean(row.aura_unlocked),
    auraCardId: row.aura_card_id ? String(row.aura_card_id) : null,
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

function auraPalette(cardId: string | null): {
  primary: string;
  secondary: string;
  rgb: [number, number, number];
  holoMul: number;
  tier: number;
} | null {
  if (!cardId) return null;
  const spec = cardSpecById(cardId);
  if (!spec) return null;

  const isParagon = spec.isParagon || spec.entity.type === "paragon";
  const levels: PathLevels =
    spec.pathLevels ?? pathLevelsFromEntity(spec.entity);
  const tier = isParagon ? 6 : maxPathTier(levels);
  const accent = accents[spec.entity.id];

  const primary = isParagon
    ? PARAGON_ACCENT.primary
    : (accent?.primary ?? "#2f9fe0");
  const secondary = isParagon
    ? PARAGON_ACCENT.secondary
    : (accent?.secondary ?? "#c8c8d4");
  const rgb = isParagon
    ? PARAGON_ACCENT.rgb
    : (accent?.rgb ?? ([47, 159, 224] as [number, number, number]));
  const holoMul = tier >= 3 ? Math.min(1, (tier - 2) / 4) : tier >= 1 ? 0.35 : 0.2;

  return { primary, secondary, rgb, holoMul, tier };
}

/** True when an aura card is equipped (shows foil FX layers). */
export function hasPlayerAura(auraCardId?: string | null): boolean {
  return Boolean(auraCardId && cardSpecById(auraCardId));
}

/** CSS vars for profile chrome / leaderboard chips / public pages. */
export function playerChromeStyle(input: {
  accentColor?: string | null;
  auraCardId?: string | null;
}): CSSProperties {
  const accent = normalizeAccentColor(input.accentColor);
  const aura = auraPalette(input.auraCardId ?? null);

  const primary = accent ?? aura?.primary ?? null;
  if (!primary && !aura) return {};

  const secondary = aura?.secondary ?? primary ?? "#2f9fe0";
  const rgb = accent ? hexToRgb(accent) : (aura?.rgb ?? [47, 159, 224]);
  const holoMul = aura?.holoMul ?? 0;

  return {
    ["--player-accent" as string]: primary ?? secondary,
    ["--player-accent-2" as string]: secondary,
    ["--player-accent-r" as string]: String(rgb[0]),
    ["--player-accent-g" as string]: String(rgb[1]),
    ["--player-accent-b" as string]: String(rgb[2]),
    ["--player-holo" as string]: String(holoMul),
    ["--player-aura" as string]: aura ? "1" : "0",
  } as CSSProperties;
}

export function hasPlayerChrome(style: CSSProperties): boolean {
  return Boolean(
    (style as Record<string, string>)["--player-accent"] ||
      (style as Record<string, string>)["--player-aura"] === "1",
  );
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
      throw new Error(
        `Need ${PROFILE_ACCENT_COST.toLocaleString()} Cash to unlock profile color.`,
      );
    }
    throw new Error(error.message);
  }
  cacheInvalidate("profile:");
  return typeof data === "number" ? data : Number(data);
}

export async function setProfileAura(cardId: string | null): Promise<number> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to set a profile aura.");
  }

  const { data, error } = await supabase.rpc("set_profile_aura", {
    p_card_id: cardId,
  });
  if (error) {
    if (/Insufficient coins/i.test(error.message)) {
      throw new Error(
        `Need ${PROFILE_AURA_COST.toLocaleString()} Cash to unlock profile aura.`,
      );
    }
    if (/must own/i.test(error.message)) {
      throw new Error("You must own that card.");
    }
    throw new Error(error.message);
  }
  cacheInvalidate("profile:");
  return typeof data === "number" ? data : Number(data);
}
