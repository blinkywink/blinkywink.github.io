import {
  ALL_TOWER_SPECS,
  isTowerComplete,
  TOWER_CHOICES,
} from "./towerCollection";
import {
  normalizeOwnedHeroIds,
  SHOPPABLE_HERO_IDS,
} from "./profileHeroes";

const ALL_PARAGON_IDS = ALL_TOWER_SPECS.filter((c) => c.isParagon).map(
  (c) => c.id,
);

/** True when every collectible tower card id is present. */
export function hasEveryTowerCard(owned: ReadonlySet<string>): boolean {
  if (ALL_TOWER_SPECS.length === 0) return false;
  for (const card of ALL_TOWER_SPECS) {
    if (!owned.has(card.id)) return false;
  }
  return true;
}

/** True when any single tower's full card set is owned. */
export function hasAnyCompleteTower(owned: ReadonlySet<string>): boolean {
  return TOWER_CHOICES.some((t) => isTowerComplete(t.name, owned));
}

/** True when every shoppable hero has been unlocked. */
export function hasAllShoppableHeroes(ownedHeroIds: unknown): boolean {
  const owned = new Set(normalizeOwnedHeroIds(ownedHeroIds));
  return SHOPPABLE_HERO_IDS.every((id) => owned.has(id));
}

export function isCollectionComplete(
  ownedCardIds: ReadonlySet<string>,
  ownedHeroIds: unknown,
): boolean {
  return (
    hasEveryTowerCard(ownedCardIds) && hasAllShoppableHeroes(ownedHeroIds)
  );
}

/** True when every tower with a paragon has that paragon owned. */
export function hasAllParagons(owned: ReadonlySet<string>): boolean {
  if (ALL_PARAGON_IDS.length === 0) return false;
  return ALL_PARAGON_IDS.every((id) => owned.has(id));
}
