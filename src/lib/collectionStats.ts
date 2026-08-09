import { cardSpecById } from "./cardCatalog";

export type CollectionStats = {
  total: number;
  uniqueTowers: number;
  /** Tower with the most owned cards, if any. */
  topTower: string | null;
  topTowerCount: number;
};

/** Derive simple collection stats from owned card ids. */
export function collectionStats(
  ownedIds: ReadonlySet<string> | Iterable<string>,
): CollectionStats {
  const owned =
    ownedIds instanceof Set ? ownedIds : new Set(ownedIds);
  const byTower = new Map<string, number>();
  for (const id of owned) {
    const spec = cardSpecById(id);
    if (!spec?.tower) continue;
    byTower.set(spec.tower, (byTower.get(spec.tower) ?? 0) + 1);
  }

  let topTower: string | null = null;
  let topTowerCount = 0;
  for (const [tower, count] of byTower) {
    if (
      count > topTowerCount ||
      (count === topTowerCount &&
        topTower != null &&
        tower.localeCompare(topTower) < 0)
    ) {
      topTower = tower;
      topTowerCount = count;
    }
  }

  return {
    total: owned.size,
    uniqueTowers: byTower.size,
    topTower,
    topTowerCount,
  };
}
