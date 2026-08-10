import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "./cache";
import { heroes } from "../data/heroes";

export const HERO_UNLOCK_COST = 5_000;
export const HERO_MAX_LEVEL = 20;
export const HERO_EQUIP_SWAP_COST = 1_000;

/**
 * Cash to unlock (toLevel 1) or buy into `toLevel` (2..20).
 * Unlock stays 5k; levels are ~30% cheaper than the old curve.
 * Server: public.hero_upgrade_cost — keep in sync.
 */
export function heroUpgradeCost(toLevel: number): number {
  const L = Math.max(1, Math.min(HERO_MAX_LEVEL, Math.floor(toLevel) || 1));
  if (L === 1) return HERO_UNLOCK_COST;
  const raw = HERO_UNLOCK_COST * Math.pow(1.118, L - 1) * 0.7;
  const snapped = Math.round(raw / 250) * 250;
  return Math.max(2_500, snapped);
}

/**
 * Game clears with the hero equipped required before you can buy
 * currentLevel → currentLevel+1. Starts at 10, +2 each step.
 */
export function heroClearsRequiredForNextLevel(currentLevel: number): number {
  const L = Math.max(
    1,
    Math.min(HERO_MAX_LEVEL - 1, Math.floor(currentLevel) || 1),
  );
  return 10 + 2 * (L - 1);
}

/** @deprecated use heroUpgradeCost — unlock floor only */
export const HERO_LEVEL_COST = HERO_UNLOCK_COST;

/** Heroes available for purchase in the shop. */
export const SHOPPABLE_HERO_IDS = [
  "quincy",
  "gwendolin",
  "obyn-greenfoot",
  "benjamin",
  "ezili",
  "sauda",
  "psi",
  "silas",
] as const;

export type ShoppableHeroId = (typeof SHOPPABLE_HERO_IDS)[number];

export function isShoppableHeroId(id: string): id is ShoppableHeroId {
  return (SHOPPABLE_HERO_IDS as readonly string[]).includes(id);
}

export function shoppableHeroes() {
  return heroes.filter((h) => isShoppableHeroId(h.id));
}

export function normalizeOwnedHeroIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim().toLowerCase();
    if (!id || seen.has(id) || !isShoppableHeroId(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeHeroLevels(
  levels: unknown,
): Record<string, number> {
  if (!levels || typeof levels !== "object" || Array.isArray(levels)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(levels as Record<string, unknown>)) {
    const id = String(k).trim().toLowerCase();
    const n = Math.floor(Number(v));
    if (!id || !Number.isFinite(n)) continue;
    out[id] = Math.max(1, Math.min(20, n));
  }
  return out;
}

export function normalizeHeroClearProgress(
  progress: unknown,
): Record<string, number> {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(progress as Record<string, unknown>)) {
    const id = String(k).trim().toLowerCase();
    const n = Math.floor(Number(v));
    if (!id || !Number.isFinite(n) || n < 0) continue;
    out[id] = n;
  }
  return out;
}

export function heroLevelFromProfile(
  levels: Record<string, number> | null | undefined,
  heroId: string,
): number {
  const n = levels?.[heroId];
  if (!n || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

export function heroClearProgressFromProfile(
  progress: Record<string, number> | null | undefined,
  heroId: string,
): number {
  const n = progress?.[heroId];
  if (!n || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function heroLevelUpReady(
  currentLevel: number,
  clearProgress: number,
): boolean {
  if (currentLevel >= HERO_MAX_LEVEL) return false;
  return clearProgress >= heroClearsRequiredForNextLevel(currentLevel);
}

export type BuyHeroResult = {
  coins: number;
  ownedHeroIds: string[];
  heroLevels: Record<string, number>;
  heroClearProgress: Record<string, number>;
  equippedHeroId: string | null;
};

export type EquipHeroResult = {
  coins: number;
  equippedHeroId: string | null;
};

export type RecordHeroClearResult = {
  heroId: string | null;
  progress: number;
  required: number;
  ready: boolean;
  heroClearProgress: Record<string, number>;
};

/** Unlock a hero (level 1) or level it up once clear progress is met. */
export async function buyHero(
  heroId: string,
  opts?: { expectedCost?: number },
): Promise<BuyHeroResult> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to unlock heroes.");
  }
  if (!isShoppableHeroId(heroId)) {
    throw new Error("That hero is not available.");
  }
  const { data, error } = await supabase.rpc("buy_hero", {
    p_hero_id: heroId,
  });
  if (error) {
    if (/Insufficient coins/i.test(error.message)) {
      const need = opts?.expectedCost ?? HERO_UNLOCK_COST;
      throw new Error(`Need ${need.toLocaleString()} Cash for this hero.`);
    }
    if (/Hero max level/i.test(error.message)) {
      throw new Error("That hero is already max level.");
    }
    if (/Not enough clears/i.test(error.message)) {
      throw new Error("Clear more games with this hero equipped first.");
    }
    if (/Already owned/i.test(error.message)) {
      throw new Error("You already own that hero.");
    }
    throw new Error(error.message);
  }
  cacheInvalidate("profile:");
  const raw = data as {
    coins?: number;
    owned_hero_ids?: string[];
    hero_levels?: Record<string, number>;
    hero_clear_progress?: Record<string, number>;
    equipped_hero_id?: string | null;
  } | null;
  return {
    coins: Number(raw?.coins) || 0,
    ownedHeroIds: normalizeOwnedHeroIds(raw?.owned_hero_ids),
    heroLevels: normalizeHeroLevels(raw?.hero_levels),
    heroClearProgress: normalizeHeroClearProgress(raw?.hero_clear_progress),
    equippedHeroId: raw?.equipped_hero_id
      ? String(raw.equipped_hero_id)
      : null,
  };
}

/**
 * Credit one clear toward the equipped hero's next level-up unlock.
 * No-op if no hero equipped / maxed / not owned.
 */
export async function recordHeroClear(): Promise<RecordHeroClearResult | null> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) return null;
  const { data, error } = await supabase.rpc("record_hero_clear");
  if (error) {
    console.warn("record_hero_clear", error.message);
    return null;
  }
  cacheInvalidate("profile:");
  const raw = data as {
    hero_id?: string | null;
    progress?: number;
    required?: number;
    ready?: boolean;
    hero_clear_progress?: Record<string, number>;
  } | null;
  if (!raw?.hero_id) {
    return {
      heroId: null,
      progress: 0,
      required: 0,
      ready: false,
      heroClearProgress: normalizeHeroClearProgress(raw?.hero_clear_progress),
    };
  }
  return {
    heroId: String(raw.hero_id),
    progress: Math.max(0, Math.floor(Number(raw.progress) || 0)),
    required: Math.max(0, Math.floor(Number(raw.required) || 0)),
    ready: Boolean(raw.ready),
    heroClearProgress: normalizeHeroClearProgress(raw.hero_clear_progress),
  };
}

/** Equip owned hero (null unequips). Swap costs 1k. */
export async function equipHero(
  heroId: string | null,
): Promise<EquipHeroResult> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to equip a hero.");
  }
  const { data, error } = await supabase.rpc("equip_hero", {
    p_hero_id: heroId,
  });
  if (error) {
    if (/Insufficient coins/i.test(error.message)) {
      throw new Error(
        `Need ${HERO_EQUIP_SWAP_COST.toLocaleString()} Cash to equip a hero.`,
      );
    }
    if (/Hero not owned/i.test(error.message)) {
      throw new Error("Unlock that hero first.");
    }
    throw new Error(error.message);
  }
  cacheInvalidate("profile:");
  const raw = data as {
    coins?: number;
    equipped_hero_id?: string | null;
  } | null;
  return {
    coins: Number(raw?.coins) || 0,
    equippedHeroId: raw?.equipped_hero_id
      ? String(raw.equipped_hero_id)
      : null,
  };
}
