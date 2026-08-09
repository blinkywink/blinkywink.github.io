import {
  maxPathTier,
  type MonkeyCardSpec,
} from "./pathCombos";

/** Ultra-rare all-highs pack (only pack-level exception). */
export const PACK_GOD_CHANCE = 1 / 400;
/** God packs always open this many cards (Obyn may still add +1). */
export const PACK_GOD_SIZE = 7;

/**
 * Per-card tier odds (each slot rolls independently).
 * High tiers fixed by design; T0–T3 share the leftover ~96.5% with the
 * peak at T2 (bell-ish from T0 → T3).
 *
 *   Paragon  0.10%
 *   T5       0.70%
 *   T4       2.70%
 *   T3      18.84%
 *   T2      37.27%   ← center
 *   T1      25.89%
 *   T0      14.50%
 *           -------
 *           100.00%
 */
export const CARD_TIER_ODDS = {
  paragon: 0.001,
  5: 0.007,
  4: 0.027,
  3: 0.1884,
  2: 0.3727,
  1: 0.2589,
  0: 0.145,
} as const;

type PullTier = "paragon" | 0 | 1 | 2 | 3 | 4 | 5;

const TIER_ROLL_ORDER: PullTier[] = [
  "paragon",
  5,
  4,
  3,
  2,
  1,
  0,
];

/** Cash paid when a pulled card is already owned (by max path tier). */
export const PACK_DUPLICATE_CASH_BY_TIER = [
  20, // T0
  30, // T1
  40, // T2
  50, // T3
  100, // T4
  500, // T5
] as const;

export const PACK_DUPLICATE_PARAGON_CASH = 5000;

/** +5 Cash per level on crosspaths (e.g. 2-1-0 → T2 base + 5). */
const CROSSPATH_DUP_BONUS_PER_LEVEL = 5;

export type DupCashMods = {
  /** Benjamin: multiply duplicate Cash (e.g. 0.15 = +15%). */
  dupCashBonusPct?: number;
};

/** Cash refund for pulling a card you already own. */
export function duplicateCashForCard(
  card: MonkeyCardSpec,
  mods: DupCashMods = {},
): number {
  let cash: number;
  if (card.isParagon) {
    cash = PACK_DUPLICATE_PARAGON_CASH;
  } else {
    const levels = card.pathLevels;
    const max = Math.max(levels[0], levels[1], levels[2]);
    const base =
      PACK_DUPLICATE_CASH_BY_TIER[max] ?? PACK_DUPLICATE_CASH_BY_TIER[0];
    let primaryUsed = false;
    let bonus = 0;
    for (const n of levels) {
      if (n === max && !primaryUsed) {
        primaryUsed = true;
        continue;
      }
      if (n > 0) bonus += CROSSPATH_DUP_BONUS_PER_LEVEL * n;
    }
    cash = base + bonus;
  }
  const pct = mods.dupCashBonusPct ?? 0;
  if (pct > 0) cash = Math.round(cash * (1 + pct));
  return cash;
}

export type PackPullResult = {
  cards: MonkeyCardSpec[];
  godPack: boolean;
  /** Obyn proc: pack opened with +1 card. */
  extraCard?: boolean;
};

function cardPullTier(card: MonkeyCardSpec): PullTier {
  if (card.isParagon) return "paragon";
  return maxPathTier(card.pathLevels) as 0 | 1 | 2 | 3 | 4 | 5;
}

/** God pack filler: T5 heavier than T4. */
function godTierWeight(card: MonkeyCardSpec): number {
  if (card.isParagon) return 0;
  const tier = maxPathTier(card.pathLevels);
  if (tier === 5) return 5;
  if (tier === 4) return 2;
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

function fillFrom(
  pulls: MonkeyCardSpec[],
  source: MonkeyCardSpec[],
  count: number,
  owned: ReadonlySet<string>,
  preferFresh: boolean,
): void {
  const ordered = preferFresh
    ? [
        ...shuffle(source.filter((c) => !owned.has(c.id))),
        ...shuffle(source.filter((c) => owned.has(c.id))),
      ]
    : shuffle(source);
  for (const card of ordered) {
    if (pulls.length >= count) break;
    if (pulls.some((p) => p.id === card.id)) continue;
    pulls.push(card);
  }
}

/** All T4+ (and a Paragon when the pool has one). */
function pullGodPackCards(
  pool: MonkeyCardSpec[],
  count: number,
  owned: ReadonlySet<string>,
): MonkeyCardSpec[] {
  const t4Pool = pool.filter(
    (c) => !c.isParagon && maxPathTier(c.pathLevels) === 4,
  );
  const t5Pool = pool.filter(
    (c) => !c.isParagon && maxPathTier(c.pathLevels) === 5,
  );
  const paragonPool = pool.filter((c) => c.isParagon);
  const highPool = [...t4Pool, ...t5Pool];
  const pulls: MonkeyCardSpec[] = [];

  // Prefer any Paragon when the pool has one.
  if (paragonPool.length) {
    pulls.push(paragonPool[Math.floor(Math.random() * paragonPool.length)]!);
  }

  const t5Bag = t5Pool
    .filter((c) => !pulls.some((p) => p.id === c.id))
    .map((c) => ({ c, weight: 1 }));
  const t5Target = Math.min(
    t5Pool.length,
    Math.max(3, Math.ceil(count * 0.4)),
    count - pulls.length,
  );
  while (
    pulls.filter((p) => !p.isParagon && maxPathTier(p.pathLevels) === 5)
      .length < t5Target &&
    t5Bag.length &&
    pulls.length < count
  ) {
    pulls.push(takeWeighted(t5Bag));
  }

  const bag = highPool
    .filter((c) => !pulls.some((p) => p.id === c.id))
    .map((c) => ({
      c,
      weight: godTierWeight(c),
    }))
    .filter((x) => x.weight > 0);

  while (pulls.length < count && bag.length) {
    pulls.push(takeWeighted(bag));
  }

  if (pulls.length < count) fillFrom(pulls, highPool, count, owned, false);
  if (pulls.length < count) fillFrom(pulls, pool, count, owned, false);

  return shuffle(pulls);
}

export type PackTierMods = {
  /** Ezili: absolute add to T5 weight (e.g. 0.0015 at L1). */
  t5WeightBonus?: number;
  /** Psi: absolute add to Paragon weight (e.g. 0.0005). */
  paragonWeightBonus?: number;
};

function tierWeight(tier: PullTier, mods: PackTierMods): number {
  let w = CARD_TIER_ODDS[tier];
  if (tier === 5) w += mods.t5WeightBonus ?? 0;
  if (tier === "paragon") w += mods.paragonWeightBonus ?? 0;
  return Math.max(0, w);
}

function rollCardTier(
  available: ReadonlySet<PullTier>,
  mods: PackTierMods = {},
): PullTier {
  let total = 0;
  for (const tier of TIER_ROLL_ORDER) {
    if (available.has(tier)) total += tierWeight(tier, mods);
  }
  if (total <= 0) return 0;

  let roll = Math.random() * total;
  for (const tier of TIER_ROLL_ORDER) {
    if (!available.has(tier)) continue;
    roll -= tierWeight(tier, mods);
    if (roll <= 0) return tier;
  }
  return 0;
}

function pullNormalPackCards(
  pool: MonkeyCardSpec[],
  count: number,
  owned: ReadonlySet<string>,
  mods: PackTierMods = {},
): MonkeyCardSpec[] {
  // Bags per tier — cards removed after pick so a pack has unique IDs.
  // Ownership does not affect weight; every card in a tier is equal.
  const bags = new Map<PullTier, { c: MonkeyCardSpec; weight: number }[]>();
  for (const tier of TIER_ROLL_ORDER) bags.set(tier, []);

  for (const c of pool) {
    bags.get(cardPullTier(c))!.push({ c, weight: 1 });
  }

  const pulls: MonkeyCardSpec[] = [];

  while (pulls.length < count) {
    const available = new Set<PullTier>();
    for (const tier of TIER_ROLL_ORDER) {
      if ((bags.get(tier)?.length ?? 0) > 0) available.add(tier);
    }
    if (!available.size) break;

    const tier = rollCardTier(available, mods);
    const bag = bags.get(tier)!;
    // If the rolled tier somehow emptied, fall through lower tiers.
    if (!bag.length) {
      let picked: MonkeyCardSpec | null = null;
      for (const fallback of TIER_ROLL_ORDER) {
        const fb = bags.get(fallback)!;
        if (!fb.length) continue;
        picked = takeWeighted(fb);
        break;
      }
      if (!picked) break;
      pulls.push(picked);
      continue;
    }
    pulls.push(takeWeighted(bag));
  }

  if (pulls.length < count) fillFrom(pulls, pool, count, owned, false);

  return shuffle(pulls);
}

export type PackPullMods = PackTierMods & {
  /** Obyn: chance to append +1 card. */
  extraCardChance?: number;
};

/**
 * Open a pack:
 * - 0.25% god pack (all T4+, usually with a Paragon) — always 7 cards
 * - Obyn may still add +1 on god or normal packs
 * - otherwise each card rolls tier odds independently (ownership ignored)
 * - duplicates convert to Cash in the opener
 */
export function pullPackCards(
  pool: MonkeyCardSpec[],
  count: number,
  owned: ReadonlySet<string> = new Set(),
  mods: PackPullMods = {},
): PackPullResult {
  if (count < 1 || !pool.length) {
    return { cards: [], godPack: false };
  }

  const highEnough = pool.some(
    (c) => c.isParagon || maxPathTier(c.pathLevels) >= 4,
  );
  const godPack = highEnough && Math.random() < PACK_GOD_CHANCE;
  let n = godPack ? PACK_GOD_SIZE : count;
  let extraCard = false;
  if ((mods.extraCardChance ?? 0) > 0 && Math.random() < mods.extraCardChance!) {
    n += 1;
    extraCard = true;
  }

  const tierMods: PackTierMods = {
    t5WeightBonus: mods.t5WeightBonus,
    paragonWeightBonus: mods.paragonWeightBonus,
  };

  return {
    godPack,
    extraCard,
    cards: godPack
      ? pullGodPackCards(pool, n, owned)
      : pullNormalPackCards(pool, n, owned, tierMods),
  };
}
