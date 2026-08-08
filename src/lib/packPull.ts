import {
  maxPathTier,
  type MonkeyCardSpec,
} from "./pathCombos";

/** Chance the pack includes one unowned T5 (when any remain). */
export const PACK_T5_CHANCE = 1 / 10;
/** Chance the pack includes one unowned Paragon (when any remain). */
export const PACK_PARAGON_CHANCE = 1 / 20;

function tierWeight(card: MonkeyCardSpec): number {
  if (card.isParagon) return 0;
  const tier = maxPathTier(card.pathLevels);
  if (tier <= 0) return 28;
  if (tier === 1) return 20;
  if (tier === 2) return 13;
  if (tier === 3) return 7;
  if (tier === 4) return 2.5;
  return 0;
}

function takeWeighted(bag: { c: MonkeyCardSpec; weight: number }[]): MonkeyCardSpec {
  const total = bag.reduce((n, x) => n + x.weight, 0);
  let roll = Math.random() * total;
  let idx = 0;
  for (; idx < bag.length; idx++) {
    roll -= bag[idx]!.weight;
    if (roll <= 0) break;
  }
  const pick = bag.splice(Math.min(idx, bag.length - 1), 1)[0]!;
  return pick.c;
}

function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function injectRare(
  pulls: MonkeyCardSpec[],
  rares: MonkeyCardSpec[],
): void {
  if (!pulls.length || !rares.length) return;
  const already = new Set(pulls.map((c) => c.id));
  const options = rares.filter((c) => !already.has(c.id));
  if (!options.length) return;

  const rare = options[Math.floor(Math.random() * options.length)]!;

  // Prefer replacing a lower-tier filler so the pack stays mostly commons.
  let replaceAt = -1;
  let bestScore = Infinity;
  for (let i = 0; i < pulls.length; i++) {
    const card = pulls[i]!;
    if (card.isParagon || maxPathTier(card.pathLevels) >= 5) continue;
    const score = maxPathTier(card.pathLevels);
    if (score < bestScore) {
      bestScore = score;
      replaceAt = i;
    }
  }
  if (replaceAt < 0) {
    replaceAt = Math.floor(Math.random() * pulls.length);
  }
  pulls[replaceAt] = rare;
}

/**
 * Open a pack for a player:
 * - never repeats a card they already own
 * - weighted toward tiers 0–3 first
 * - ≈1/10 packs include one T5; ≈1/20 include one Paragon
 * - once low tiers are cleared, higher unowned cards fill naturally
 */
export function pullPackCards(
  pool: MonkeyCardSpec[],
  count: number,
  owned: ReadonlySet<string>,
): MonkeyCardSpec[] {
  if (count < 1) return [];

  const unowned = pool.filter((c) => !owned.has(c.id));
  if (!unowned.length) return [];

  const lowPool = unowned.filter(
    (c) => !c.isParagon && maxPathTier(c.pathLevels) <= 4,
  );
  const t5Pool = unowned.filter(
    (c) => !c.isParagon && maxPathTier(c.pathLevels) === 5,
  );
  const paragonPool = unowned.filter((c) => c.isParagon);

  const pulls: MonkeyCardSpec[] = [];
  const bag = lowPool.map((c) => ({ c, weight: tierWeight(c) }));

  while (pulls.length < count && bag.length) {
    pulls.push(takeWeighted(bag));
  }

  // Natural progression: if mostly low tiers are owned, fill with T5 then Paragon.
  const fillFrom = (source: MonkeyCardSpec[]) => {
    for (const card of shuffle(source)) {
      if (pulls.length >= count) break;
      if (pulls.some((p) => p.id === card.id)) continue;
      pulls.push(card);
    }
  };
  if (pulls.length < count) fillFrom(t5Pool);
  if (pulls.length < count) fillFrom(paragonPool);

  // Pack-wide rarity rolls (at most one of each).
  if (Math.random() < PACK_T5_CHANCE) {
    injectRare(pulls, t5Pool);
  }
  if (Math.random() < PACK_PARAGON_CHANCE) {
    injectRare(pulls, paragonPool);
  }

  return shuffle(pulls);
}
