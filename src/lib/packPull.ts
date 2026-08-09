import {
  maxPathTier,
  type MonkeyCardSpec,
} from "./pathCombos";

/** Chance the pack includes one T5 (replaces a filler slot when any exist). */
export const PACK_T5_CHANCE = 1 / 40;
/** Chance the pack includes one Paragon (replaces a filler slot when any exist). */
export const PACK_PARAGON_CHANCE = 1 / 80;
/** Ultra-rare all-highs pack. */
export const PACK_GOD_CHANCE = 1 / 400;
/** Cash paid when a pulled card is already owned. */
export const PACK_DUPLICATE_CASH = 70;

export type PackPullResult = {
  cards: MonkeyCardSpec[];
  godPack: boolean;
};

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

/** God pack: T5 heavier than T4. */
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

function injectRare(
  pulls: MonkeyCardSpec[],
  rares: MonkeyCardSpec[],
  owned: ReadonlySet<string>,
): void {
  if (!pulls.length || !rares.length) return;
  const already = new Set(pulls.map((c) => c.id));
  const fresh = rares.filter((c) => !already.has(c.id) && !owned.has(c.id));
  const dups = rares.filter((c) => !already.has(c.id) && owned.has(c.id));
  // Prefer a new rare; only fall back to a duplicate rare if none remain.
  const options = fresh.length ? fresh : dups;
  if (!options.length) return;

  const rare = options[Math.floor(Math.random() * options.length)]!;

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

function pullNormalPackCards(
  pool: MonkeyCardSpec[],
  count: number,
  owned: ReadonlySet<string>,
): MonkeyCardSpec[] {
  const lowPool = pool.filter(
    (c) => !c.isParagon && maxPathTier(c.pathLevels) <= 4,
  );
  const t5Pool = pool.filter(
    (c) => !c.isParagon && maxPathTier(c.pathLevels) === 5,
  );
  const paragonPool = pool.filter((c) => c.isParagon);
  const ratio = ownershipRatio(pool, owned);
  const dupMult = ownedPullMult(ratio);

  const pulls: MonkeyCardSpec[] = [];
  const bag = lowPool
    .map((c) => ({
      c,
      weight:
        tierWeight(c) * (owned.has(c.id) ? Math.max(0.001, dupMult) : 1),
    }))
    .filter((x) => x.weight > 0);

  while (pulls.length < count && bag.length) {
    pulls.push(takeWeighted(bag));
  }

  if (pulls.length < count) fillFrom(pulls, t5Pool, count, owned, true);
  if (pulls.length < count) fillFrom(pulls, paragonPool, count, owned, true);

  if (Math.random() < PACK_T5_CHANCE) {
    injectRare(pulls, t5Pool, owned);
  }
  if (Math.random() < PACK_PARAGON_CHANCE) {
    injectRare(pulls, paragonPool, owned);
  }

  return shuffle(pulls);
}

/**
 * Open a pack:
 * - 0.25% god pack (all T4+, usually with a Paragon)
 * - otherwise weighted commons + rare injects
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
