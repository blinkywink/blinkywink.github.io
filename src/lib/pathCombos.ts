import { towerEntities } from "../data/towers";
import type { TowerEntity } from "../data/types";

/** BTD6 path investments: top / middle / bottom. */
export type PathLevels = [number, number, number];

export type MonkeyCardSpec = {
  id: string;
  tower: string;
  pathLevels: PathLevels;
  /** Portrait / name / colors source. */
  entity: TowerEntity;
  isParagon: boolean;
};

/** True if this is a legal BTD6 tower upgrade set (incl. 0-0-0). */
export function isLegalPathLevels(levels: PathLevels): boolean {
  const [a, b, c] = levels;
  if ([a, b, c].some((n) => n < 0 || n > 5 || !Number.isInteger(n))) return false;
  const nonzero = [a, b, c].filter((n) => n > 0).length;
  if (nonzero > 2) return false;
  const high = [a, b, c].filter((n) => n >= 3).length;
  if (high > 1) return false;
  return true;
}

/** All 64 legal path codes for a monkey (including 0-0-0). */
export function allLegalPathLevels(): PathLevels[] {
  const out: PathLevels[] = [];
  for (let a = 0; a <= 5; a++) {
    for (let b = 0; b <= 5; b++) {
      for (let c = 0; c <= 5; c++) {
        const levels: PathLevels = [a, b, c];
        if (isLegalPathLevels(levels)) out.push(levels);
      }
    }
  }
  return out;
}

export function formatPathLevels(levels: PathLevels): string {
  return levels.join("-");
}

export function maxPathTier(levels: PathLevels): number {
  return Math.max(levels[0], levels[1], levels[2]);
}

/** Slug prefix used in entity ids (`dart-monkey` from `dart-monkey-15`). */
export function towerIdSlug(towerName: string): string {
  const hit = towerEntities.find((e) => e.tower === towerName);
  if (!hit) return towerName.toLowerCase().replace(/\s+/g, "-");
  return hit.id.replace(/-(?:\d{2,3}|paragon)$/i, "");
}

export function pathLevelsFromEntity(entity: TowerEntity): PathLevels {
  if (entity.type === "paragon") return [5, 5, 5];
  if (entity.type === "tower" || entity.path == null || entity.tier <= 0) {
    return [0, 0, 0];
  }
  const levels: PathLevels = [0, 0, 0];
  const idx = entity.path - 1;
  if (idx >= 0 && idx < 3) levels[idx] = Math.min(5, entity.tier);
  return levels;
}

function findBase(tower: string): TowerEntity | null {
  return towerEntities.find((e) => e.tower === tower && e.type === "tower") ?? null;
}

export function findParagon(tower: string): TowerEntity | null {
  return towerEntities.find((e) => e.tower === tower && e.type === "paragon") ?? null;
}

/** Collectible id for that tower's Paragon card (`ninja-monkey-paragon`). */
export function paragonCardId(tower: string): string {
  return `${towerIdSlug(tower)}-paragon`;
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

/** Primary art entity: highest tier path; ties → earlier path. */
export function primaryEntityForPaths(
  tower: string,
  levels: PathLevels,
): TowerEntity | null {
  const max = maxPathTier(levels);
  if (max <= 0) return findBase(tower);
  for (let path = 1; path <= 3; path++) {
    if (levels[path - 1] === max) {
      return findUpgrade(tower, path, max) ?? findBase(tower);
    }
  }
  return findBase(tower);
}

export function upgradeEntityId(
  towerSlug: string,
  path: number,
  tier: number,
): string {
  return `${towerSlug}-${path}${tier}`;
}

/** Path investments for icon row: lower tier first (left), higher tier right. */
export function investedPathTiers(
  levels: PathLevels,
): { path: number; tier: number }[] {
  const items: { path: number; tier: number }[] = [];
  for (let path = 1; path <= 3; path++) {
    const tier = levels[path - 1];
    if (tier > 0) items.push({ path, tier });
  }
  items.sort((a, b) => a.tier - b.tier || a.path - b.path);
  return items;
}

/** Every collectible config for a tower: 64 path combos + paragon if present. */
export function buildTowerCardSpecs(tower: string): MonkeyCardSpec[] {
  const base = findBase(tower);
  if (!base) return [];

  const slug = towerIdSlug(tower);
  const specs: MonkeyCardSpec[] = [];

  for (const levels of allLegalPathLevels()) {
    const entity = primaryEntityForPaths(tower, levels);
    if (!entity) continue;
    specs.push({
      id: `${slug}-${formatPathLevels(levels)}`,
      tower,
      pathLevels: levels,
      entity,
      isParagon: false,
    });
  }

  const paragon = findParagon(tower);
  if (paragon) {
    specs.push({
      id: `${slug}-paragon`,
      tower,
      pathLevels: [5, 5, 5],
      entity: paragon,
      isParagon: true,
    });
  }

  return specs;
}

function totalCircles(levels: PathLevels): number {
  return levels[0] + levels[1] + levels[2];
}

function investedPathCount(levels: PathLevels): number {
  return levels.filter((n) => n > 0).length;
}

/** Sort key for a portrait group (shared main image / entity). */
function portraitGroupRank(spec: MonkeyCardSpec): [
  number,
  number,
  string,
] {
  // tower base (0) → upgrades by tier → paragon last among entities
  const typeRank =
    spec.entity.type === "tower" ? 0 : spec.entity.type === "upgrade" ? 1 : 2;
  const tier = spec.entity.type === "tower" ? 0 : spec.entity.tier;
  return [typeRank, tier, spec.entity.id];
}

export function sortCardSpecs(a: MonkeyCardSpec, b: MonkeyCardSpec): number {
  if (a.isParagon !== b.isParagon) return a.isParagon ? 1 : -1;

  // Keep every crosspath that shares the same main portrait together.
  const [ta, ra, ida] = portraitGroupRank(a);
  const [tb, rb, idb] = portraitGroupRank(b);
  if (ta !== tb) return ta - tb;
  if (ra !== rb) return ra - rb;
  if (ida !== idb) return ida.localeCompare(idb);

  // Within a portrait group: fewer circles, then single-path, then path code
  const ca = totalCircles(a.pathLevels);
  const cb = totalCircles(b.pathLevels);
  if (ca !== cb) return ca - cb;

  const pa = investedPathCount(a.pathLevels);
  const pb = investedPathCount(b.pathLevels);
  if (pa !== pb) return pa - pb;

  return formatPathLevels(a.pathLevels).localeCompare(
    formatPathLevels(b.pathLevels),
  );
}
