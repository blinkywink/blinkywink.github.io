import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "./cache";
import { heroes } from "../data/heroes";

export const HERO_UNLOCK_COST = 5_000;
export const HERO_MAX_LEVEL = 20;
export const HERO_EQUIP_SWAP_COST = 1_000;

/**
 * Cash to unlock (toLevel 1) or buy into `toLevel` (2..20).
 * Always ≥ unlock cost and rises each level — early levels buyable after
 * a quiz or two; late levels are long sinks (~L20 step ≈ 42k, full max ≈ 352k).
 */
export function heroUpgradeCost(toLevel: number): number {
  const L = Math.max(1, Math.min(HERO_MAX_LEVEL, Math.floor(toLevel) || 1));
  const raw = HERO_UNLOCK_COST * Math.pow(1.118, L - 1);
  const snapped = Math.round(raw / 250) * 250;
  return Math.max(HERO_UNLOCK_COST, snapped);
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

export function heroLevelFromProfile(
  levels: Record<string, number> | null | undefined,
  heroId: string,
): number {
  const n = levels?.[heroId];
  if (!n || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

export type BuyHeroResult = {
  coins: number;
  ownedHeroIds: string[];
  heroLevels: Record<string, number>;
  equippedHeroId: string | null;
};

export type EquipHeroResult = {
  coins: number;
  equippedHeroId: string | null;
};

/** Unlock a hero (level 1) or level it up. Cost scales with next level. */
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
    equipped_hero_id?: string | null;
  } | null;
  return {
    coins: Number(raw?.coins) || 0,
    ownedHeroIds: normalizeOwnedHeroIds(raw?.owned_hero_ids),
    heroLevels: normalizeHeroLevels(raw?.hero_levels),
    equippedHeroId: raw?.equipped_hero_id
      ? String(raw.equipped_hero_id)
      : null,
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
        `Need ${HERO_EQUIP_SWAP_COST.toLocaleString()} Cash to change heroes.`,
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
