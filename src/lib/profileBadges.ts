import { loadAppSession } from "../auth/session";
import { getAccessToken, supabase } from "./supabase";
import {
  hasAllParagons,
  hasAllShoppableHeroes,
  hasAnyCompleteTower,
  hasEveryTowerCard,
} from "./collectionComplete";

export const EARLY_SUPPORTER_BADGE = "early_supporter";
export const CURSED_HOLO_BADGE = "cursed_holo";
export const COLLECTED_EVERY_CARD_BADGE = "collected_every_card";
export const COLLECTED_A_TOWER_BADGE = "collected_a_tower";
export const LEVEL_20_HERO_BADGE = "level_20_hero";
export const DEGREE_100_PARAGON_BADGE = "degree_100_paragon";
export const OWNS_A_PARAGON_BADGE = "owns_a_paragon";
export const OWNS_ALL_PARAGONS_BADGE = "owns_all_paragons";
export const OWNS_ALL_HEROES_BADGE = "owns_all_heroes";

export type ProfileBadgeDef = {
  id: string;
  src: string;
  label: string;
};

export const PROFILE_BADGES: Record<string, ProfileBadgeDef> = {
  [CURSED_HOLO_BADGE]: {
    id: CURSED_HOLO_BADGE,
    src: "/images/ui/medals/cursed-holo.png",
    label: "pulled the ???",
  },
  [EARLY_SUPPORTER_BADGE]: {
    id: EARLY_SUPPORTER_BADGE,
    src: "/images/ui/medals/early-supporter.webp",
    label: "early supporter",
  },
  [COLLECTED_EVERY_CARD_BADGE]: {
    id: COLLECTED_EVERY_CARD_BADGE,
    src: "/images/ui/medals/collected-every-card.png",
    label: "collected every card",
  },
  [OWNS_ALL_PARAGONS_BADGE]: {
    id: OWNS_ALL_PARAGONS_BADGE,
    src: "/images/ui/medals/owns-all-paragons.png",
    label: "pulled all paragons",
  },
  [DEGREE_100_PARAGON_BADGE]: {
    id: DEGREE_100_PARAGON_BADGE,
    src: "/images/ui/medals/degree-100-paragon.png",
    label: "degree 100 paragon",
  },
  [COLLECTED_A_TOWER_BADGE]: {
    id: COLLECTED_A_TOWER_BADGE,
    src: "/images/ui/medals/collected-a-tower.png",
    label: "collected all of a tower",
  },
  [OWNS_ALL_HEROES_BADGE]: {
    id: OWNS_ALL_HEROES_BADGE,
    src: "/images/ui/medals/owns-all-heroes.png",
    label: "unlocked all heroes",
  },
  [LEVEL_20_HERO_BADGE]: {
    id: LEVEL_20_HERO_BADGE,
    src: "/images/ui/medals/level-20-hero.png",
    label: "level 20 hero",
  },
  [OWNS_A_PARAGON_BADGE]: {
    id: OWNS_A_PARAGON_BADGE,
    src: "/images/ui/medals/owns-a-paragon.png",
    label: "pulled a paragon",
  },
};

/** Display order: rarest / hardest first. */
const BADGE_RANK: Record<string, number> = Object.fromEntries(
  Object.keys(PROFILE_BADGES).map((id, i) => [id, i]),
);

function sortBadgeIds(ids: string[]): string[] {
  return ids
    .slice()
    .sort(
      (a, b) =>
        (BADGE_RANK[a] ?? 999) - (BADGE_RANK[b] ?? 999) || a.localeCompare(b),
    );
}

function levelsIncludeMaxHero(levels: unknown): boolean {
  if (!levels || typeof levels !== "object" || Array.isArray(levels)) {
    return false;
  }
  for (const v of Object.values(levels as Record<string, unknown>)) {
    const n = Math.floor(Number(v));
    if (Number.isFinite(n) && n >= 20) return true;
  }
  return false;
}

export function normalizeBadgeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const next: string[] = [];
  for (const item of raw) {
    const id =
      typeof item === "string"
        ? item
        : item && typeof item === "object" && "badge_id" in item
          ? String((item as { badge_id: unknown }).badge_id ?? "")
          : "";
    if (id && PROFILE_BADGES[id] && !next.includes(id)) next.push(id);
  }
  return sortBadgeIds(next);
}

export function badgesFromIds(ids: readonly string[] | null | undefined) {
  return sortBadgeIds([...(ids ?? [])])
    .map((id) => PROFILE_BADGES[id])
    .filter((b): b is ProfileBadgeDef => Boolean(b));
}

export async function fetchBadgeIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("profile_badges")
    .select("badge_id")
    .eq("user_id", userId);
  if (error) {
    console.warn("badge lookup failed", error.message);
    return [];
  }
  return normalizeBadgeIds(data);
}

/** Award the cursed holo badge after the pack jumpscare. Idempotent. */
export async function awardCursedHoloBadge(): Promise<boolean> {
  if (!getAccessToken() || !loadAppSession()) return false;
  const { data, error } = await supabase.rpc("award_cursed_holo_badge");
  if (error) {
    console.warn("cursed holo badge award failed", error.message);
    return false;
  }
  return Boolean(data);
}

/** Permanent once granted - selling cards later does not remove it. */
export async function awardCollectedEveryCardBadge(): Promise<boolean> {
  if (!getAccessToken() || !loadAppSession()) return false;
  const { data, error } = await supabase.rpc(
    "award_collected_every_card_badge",
  );
  if (error) {
    console.warn("collected every card badge award failed", error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * If the player owns every tower card and every shoppable hero, grant the badge.
 * Safe to call often - server insert is idempotent.
 */
export async function maybeAwardCollectedEveryCardBadge(
  ownedCardIds: ReadonlySet<string>,
  ownedHeroIds: unknown,
): Promise<boolean> {
  if (!hasEveryTowerCard(ownedCardIds)) return false;
  if (!hasAllShoppableHeroes(ownedHeroIds)) return false;
  return awardCollectedEveryCardBadge();
}

/** Permanent once granted - selling cards later does not remove it. */
export async function awardCollectedATowerBadge(): Promise<boolean> {
  if (!getAccessToken() || !loadAppSession()) return false;
  const { data, error } = await supabase.rpc("award_collected_a_tower_badge");
  if (error) {
    console.warn("collected a tower badge award failed", error.message);
    return false;
  }
  return Boolean(data);
}

/** Grant when any one tower's full card set is owned (or listed). */
export async function maybeAwardCollectedATowerBadge(
  ownedCardIds: ReadonlySet<string>,
): Promise<boolean> {
  if (!hasAnyCompleteTower(ownedCardIds)) return false;
  return awardCollectedATowerBadge();
}

/** Permanent once granted. */
export async function awardLevel20HeroBadge(): Promise<boolean> {
  if (!getAccessToken() || !loadAppSession()) return false;
  const { data, error } = await supabase.rpc("award_level_20_hero_badge");
  if (error) {
    console.warn("level 20 hero badge award failed", error.message);
    return false;
  }
  return Boolean(data);
}

/** Grant when any owned hero reaches level 20. */
export async function maybeAwardLevel20HeroBadge(
  heroLevels: unknown,
): Promise<boolean> {
  if (!levelsIncludeMaxHero(heroLevels)) return false;
  return awardLevel20HeroBadge();
}

/** Permanent once granted. */
export async function awardDegree100ParagonBadge(): Promise<boolean> {
  if (!getAccessToken() || !loadAppSession()) return false;
  const { data, error } = await supabase.rpc("award_degree_100_paragon_badge");
  if (error) {
    console.warn("degree 100 paragon badge award failed", error.message);
    return false;
  }
  return Boolean(data);
}

function paragonsIncludeDegree100(
  paragons: ReadonlyMap<string, { degree?: number }> | Record<string, { degree?: number }>,
): boolean {
  const values =
    paragons instanceof Map ? paragons.values() : Object.values(paragons);
  for (const state of values) {
    const n = Math.floor(Number(state?.degree));
    if (Number.isFinite(n) && n >= 100) return true;
  }
  return false;
}

/** Grant when any paragon reaches degree 100. */
export async function maybeAwardDegree100ParagonBadge(
  paragons:
    | ReadonlyMap<string, { degree?: number }>
    | Record<string, { degree?: number }>
    | null
    | undefined,
): Promise<boolean> {
  if (!paragons || !paragonsIncludeDegree100(paragons)) return false;
  return awardDegree100ParagonBadge();
}

/** Permanent once granted. */
export async function awardOwnsAParagonBadge(): Promise<boolean> {
  if (!getAccessToken() || !loadAppSession()) return false;
  const { data, error } = await supabase.rpc("award_owns_a_paragon_badge");
  if (error) {
    console.warn("owns a paragon badge award failed", error.message);
    return false;
  }
  return Boolean(data);
}

function ownsAnyParagon(cardIds: Iterable<string>): boolean {
  for (const id of cardIds) {
    if (String(id).endsWith("-paragon")) return true;
  }
  return false;
}

/** Grant when the player owns (or has listed) any paragon card. */
export async function maybeAwardOwnsAParagonBadge(
  ownedCardIds: ReadonlySet<string>,
): Promise<boolean> {
  if (!ownsAnyParagon(ownedCardIds)) return false;
  return awardOwnsAParagonBadge();
}

/** Permanent once granted. */
export async function awardOwnsAllParagonsBadge(): Promise<boolean> {
  if (!getAccessToken() || !loadAppSession()) return false;
  const { data, error } = await supabase.rpc("award_owns_all_paragons_badge");
  if (error) {
    console.warn("owns all paragons badge award failed", error.message);
    return false;
  }
  return Boolean(data);
}

/** Grant when every tower paragon is in the player's inventory (listed copies don't count). */
export async function maybeAwardOwnsAllParagonsBadge(
  ownedCardIds: ReadonlySet<string>,
): Promise<boolean> {
  if (!hasAllParagons(ownedCardIds)) return false;
  return awardOwnsAllParagonsBadge();
}

/** Permanent once granted. */
export async function awardOwnsAllHeroesBadge(): Promise<boolean> {
  if (!getAccessToken() || !loadAppSession()) return false;
  const { data, error } = await supabase.rpc("award_owns_all_heroes_badge");
  if (error) {
    console.warn("owns all heroes badge award failed", error.message);
    return false;
  }
  return Boolean(data);
}

/** Grant when every shoppable hero is unlocked. */
export async function maybeAwardOwnsAllHeroesBadge(
  ownedHeroIds: unknown,
): Promise<boolean> {
  if (!hasAllShoppableHeroes(ownedHeroIds)) return false;
  return awardOwnsAllHeroesBadge();
}
