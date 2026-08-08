import { towerEntities } from "../../data/towers";
import type { TowerEntity } from "../../data/types";
import {
  formatPathLevels,
  primaryEntityForPaths,
  type PathLevels,
} from "../../lib/pathCombos";

export type PricedCombo = {
  id: string;
  tower: string;
  pathLevels: PathLevels;
  /** Portrait / display name source (highest-tier upgrade on the combo). */
  entity: TowerEntity;
  /** Medium cash: base + every upgrade tier purchased to reach this path. */
  cost: number;
};

function findBase(tower: string): TowerEntity | null {
  return towerEntities.find((e) => e.tower === tower && e.type === "tower") ?? null;
}

function findUpgrade(
  tower: string,
  path: number,
  tier: number,
): TowerEntity | null {
  return (
    towerEntities.find(
      (e) =>
        e.tower === tower &&
        e.type === "upgrade" &&
        e.path === path &&
        e.tier === tier,
    ) ?? null
  );
}

/** Sum base + each upgrade tier on each path (Medium wiki cash). */
export function comboCost(tower: string, levels: PathLevels): number {
  const base = findBase(tower);
  if (!base?.cost) return 0;
  let total = base.cost;
  for (let path = 1; path <= 3; path++) {
    const maxTier = levels[path - 1] ?? 0;
    for (let tier = 1; tier <= maxTier; tier++) {
      const up = findUpgrade(tower, path, tier);
      total += up?.cost ?? 0;
    }
  }
  return total;
}

export function buildPricedCombo(
  tower: string,
  levels: PathLevels,
): PricedCombo | null {
  const entity = primaryEntityForPaths(tower, levels);
  const base = findBase(tower);
  if (!entity || !base) return null;
  const slug = base.id.replace(/-000$/, "");
  return {
    id: `${slug}-${formatPathLevels(levels)}`,
    tower,
    pathLevels: levels,
    entity,
    cost: comboCost(tower, levels),
  };
}

export function sideTotal(combos: PricedCombo[]): number {
  return combos.reduce((sum, c) => sum + c.cost, 0);
}

export function formatCash(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}
