import { towers } from "../data/towers";
import {
  buildTowerCardSpecs,
  formatPathLevels,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "./pathCombos";

let specsCache: MonkeyCardSpec[] | null = null;
let byIdCache: Map<string, MonkeyCardSpec> | null = null;

/** Every collectible card (all towers). */
export function allCardSpecs(): MonkeyCardSpec[] {
  if (!specsCache) {
    specsCache = towers
      .flatMap((t) => buildTowerCardSpecs(t.name))
      .slice()
      .sort(sortCardSpecs);
  }
  return specsCache;
}

export function cardSpecById(id: string): MonkeyCardSpec | null {
  if (!byIdCache) {
    byIdCache = new Map(allCardSpecs().map((c) => [c.id, c]));
  }
  return byIdCache.get(id) ?? null;
}

export function matchesCardQuery(card: MonkeyCardSpec, q: string): boolean {
  if (!q) return true;
  const hay = [
    card.entity.name,
    card.tower,
    formatPathLevels(card.pathLevels),
    card.id,
    card.isParagon ? "paragon" : "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
