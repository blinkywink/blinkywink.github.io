import { towers as baseTowers, towerEntities } from "../data/towers";
import {
  buildTowerCardSpecs,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "./pathCombos";

export type TowerChoice = {
  name: string;
  category: string;
  image: string;
  cardCount: number;
};

export function cardCountForTower(tower: string): number {
  const hasParagon = towerEntities.some(
    (e) => e.tower === tower && e.type === "paragon",
  );
  return 64 + (hasParagon ? 1 : 0);
}

export const TOWER_CHOICES: TowerChoice[] = baseTowers.map((t) => ({
  name: t.tower,
  category: t.category,
  image: t.image,
  cardCount: cardCountForTower(t.tower),
}));

export const TOWER_SPECS: Record<string, MonkeyCardSpec[]> = Object.fromEntries(
  TOWER_CHOICES.map((t) => [
    t.name,
    buildTowerCardSpecs(t.name).slice().sort(sortCardSpecs),
  ]),
);

/** Every collectible card across all towers. */
export const ALL_TOWER_SPECS: MonkeyCardSpec[] = TOWER_CHOICES.flatMap(
  (t) => TOWER_SPECS[t.name] ?? [],
);

export function towerChoiceByName(name: string): TowerChoice | null {
  return TOWER_CHOICES.find((t) => t.name === name) ?? null;
}

export function ownedCountForTower(
  towerName: string,
  owned: ReadonlySet<string>,
): number {
  const specs = TOWER_SPECS[towerName] ?? [];
  return specs.reduce((n, card) => n + (owned.has(card.id) ? 1 : 0), 0);
}

export function isTowerComplete(
  towerName: string,
  owned: ReadonlySet<string>,
): boolean {
  const tower = towerChoiceByName(towerName);
  if (!tower || tower.cardCount <= 0) return false;
  return ownedCountForTower(towerName, owned) >= tower.cardCount;
}

/** Towers that just crossed from incomplete → complete. */
export function newlyCompletedTowers(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): string[] {
  const completed: string[] = [];
  for (const tower of TOWER_CHOICES) {
    if (isTowerComplete(tower.name, before)) continue;
    if (isTowerComplete(tower.name, after)) completed.push(tower.name);
  }
  return completed;
}
