import {
  maxPathTier,
  type MonkeyCardSpec,
} from "./pathCombos";

/** Ultra-rare all-highs pack (only pack-level exception). */
export const PACK_GOD_CHANCE = 1 / 400;

/**
 * Per-card tier odds (each slot rolls independently).
 * High tiers fixed by design; T0–T3 share the leftover ~93.2% with the
 * peak at T2 (bell-ish from T0 → T3).
 *
 *   Paragon  0.10%
 *   T5       0.70%
 *   T4       6.00%
 *   T3      18.20%
 *   T2      36.00%   ← center
 *   T1      25.00%
 *   T0      14.00%
 *           -------
 *           100.00%
 */
export const CARD_TIER_ODDS = {
  paragon: 0.001,
  5: 0.007,
  4: 0.06,
  3: 0.182,
  2: 0.36,
  1: 0.25,
  0: 0.14,
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

/** Cash refund for pulling a card you already own. */
export function duplicateCashForCard(card: MonkeyCardSpec): number {
  if (card.isParagon) return PACK_DUPLICATE_PARAGON_CASH;
  const levels = card.pathLevels;
  const max = Math.max(levels[0], levels[1], levels[2]);
  const base = PACK_DUPLICATE_CASH_BY_TIER[max] ?? PACK_DUPLICATE_CASH_BY_TIER[0];
  let primaryUsed = false;
  let bonus = 0;
  for (const n of levels) {
    if (n === max && !primaryUsed) {
      primaryUsed = true;
      continue;
    }
    if (n > 0) bonus += CROSSPATH_DUP_BONUS_PER_LEVEL * n;
  }
  return base + bonus;
}

export type PackPullResult = {
  cards: MonkeyCardSpec[];
  godPack: boolean;
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

/**
 * Owned cards start nearly banned, then ramp in as the pool fills.
 * Early: ~0–1 dup/pack. Near-complete: dups feel normal again.
 */
function ownedPullMult(ownedRatio: number): number {
  if (ownedRatio <= 0) return 0;
  return Math.min(1, Math.pow(ownedRatio, 2.15) * 1.2 + 0.02);
}

function ownershipRatio(
  pool: MonkeyCardSpec[],
  owned: ReadonlySet<string>,
): number {
  if (!pool.length) return 0;
  let n = 0;
  for (const c of pool) if (owned.has(c.id)) n += 1;
  return n / pool.length;
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
  const ratio = ownershipRatio(highPool.length ? highPool : pool, owned);
  const dupMult = ownedPullMult(ratio);

  const pulls: MonkeyCardSpec[] = [];

  // Prefer an unowned Paragon when possible.
  if (paragonPool.length) {
    const fresh = paragonPool.filter((c) => !owned.has(c.id));
    const bag = fresh.length ? fresh : paragonPool;
    pulls.push(bag[Math.floor(Math.random() * bag.length)]!);
  }

  const t5Bag = t5Pool.map((c) => ({
    c,
    weight: owned.has(c.id) ? Math.max(0.001, dupMult) : 1,
  }));
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
      weight:
        godTierWeight(c) * (owned.has(c.id) ? Math.max(0.001, dupMult) : 1),
    }))
    .filter((x) => x.weight > 0);

  while (pulls.length < count && bag.length) {
    pulls.push(takeWeighted(bag));
  }

  if (pulls.length < count) fillFrom(pulls, highPool, count, owned, true);
  if (pulls.length < count) fillFrom(pulls, pool, count, owned, true);

  return shuffle(pulls);
}

function rollCardTier(available: ReadonlySet<PullTier>): PullTier {
  let total = 0;
  for (const tier of TIER_ROLL_ORDER) {
    if (available.has(tier)) total += CARD_TIER_ODDS[tier];
  }
  if (total <= 0) return 0;

  let roll = Math.random() * total;
  for (const tier of TIER_ROLL_ORDER) {
    if (!available.has(tier)) continue;
    roll -= CARD_TIER_ODDS[tier];
    if (roll <= 0) return tier;
  }
  return 0;
}

function pullNormalPackCards(
  pool: MonkeyCardSpec[],
  count: number,
  owned: ReadonlySet<string>,
): MonkeyCardSpec[] {
  const ratio = ownershipRatio(pool, owned);
  const dupMult = ownedPullMult(ratio);

  // Bags per tier — cards removed after pick so a pack has unique IDs.
  const bags = new Map<PullTier, { c: MonkeyCardSpec; weight: number }[]>();
  for (const tier of TIER_ROLL_ORDER) bags.set(tier, []);

  for (const c of pool) {
    const tier = cardPullTier(c);
    const weight = owned.has(c.id) ? Math.max(0.001, dupMult) : 1;
    if (weight <= 0) continue;
    bags.get(tier)!.push({ c, weight });
  }

  const pulls: MonkeyCardSpec[] = [];

  while (pulls.length < count) {
    const available = new Set<PullTier>();
    for (const tier of TIER_ROLL_ORDER) {
      if ((bags.get(tier)?.length ?? 0) > 0) available.add(tier);
    }
    if (!available.size) break;

    const tier = rollCardTier(available);
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

  if (pulls.length < count) fillFrom(pulls, pool, count, owned, true);

  return shuffle(pulls);
}

/**
 * Open a pack:
 * - 0.25% god pack (all T4+, usually with a Paragon) — pack-level only
 * - otherwise each card rolls tier odds independently
 * - early collections heavily prefer new cards; dups ramp as you complete the pool
 * - duplicates convert to Cash in the opener
 */
export function pullPackCards(
  pool: MonkeyCardSpec[],
  count: number,
  owned: ReadonlySet<string> = new Set(),
): PackPullResult {
  if (count < 1 || !pool.length) {
    return { cards: [], godPack: false };
  }

  const highEnough = pool.some(
    (c) => c.isParagon || maxPathTier(c.pathLevels) >= 4,
  );
  const godPack = highEnough && Math.random() < PACK_GOD_CHANCE;

  return {
    godPack,
    cards: godPack
      ? pullGodPackCards(pool, count, owned)
      : pullNormalPackCards(pool, count, owned),
  };
}
