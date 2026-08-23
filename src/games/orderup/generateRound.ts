import { towers } from "../../data/towers";
import { allLegalPathLevels, type PathLevels } from "../../lib/pathCombos";
import {
  buildPricedCombo,
  type PricedCombo,
} from "../pricecheck/costs";
import { handSizeForRound, targetCostRatio } from "./config";

export type OrderUpRound = {
  round: number;
  /** Shuffled display order at start. */
  items: PricedCombo[];
  /** Correct ascending cost order (cheapest → most expensive). */
  correctIds: string[];
};

const LEGAL: PathLevels[] = allLegalPathLevels();
const TOWER_NAMES = towers.map((t) => t.tower);

/** All distinct-cost legal combos (built once). */
let POOL: PricedCombo[] | null = null;

function getPool(): PricedCombo[] {
  if (POOL) return POOL;
  const byCost = new Map<number, PricedCombo>();
  for (const tower of TOWER_NAMES) {
    for (const levels of LEGAL) {
      const combo = buildPricedCombo(tower, levels);
      if (!combo || combo.cost <= 0) continue;
      // Prefer first seen at each exact cost so ids stay unique for sorting
      if (!byCost.has(combo.cost)) byCost.set(combo.cost, combo);
    }
  }
  POOL = [...byCost.values()].sort((a, b) => a.cost - b.cost);
  return POOL;
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

function handRatio(items: PricedCombo[]): number {
  let lo = Infinity;
  let hi = 0;
  for (const c of items) {
    lo = Math.min(lo, c.cost);
    hi = Math.max(hi, c.cost);
  }
  return hi / Math.max(lo, 1);
}

/** Prefer evenly spaced picks across a wide cost band (easy rounds). */
function pickWideSpread(
  pool: PricedCombo[],
  count: number,
  target: { min: number; max: number },
): PricedCombo[] | null {
  if (pool.length < count) return null;

  for (let attempt = 0; attempt < 60; attempt++) {
    // Anchor lows and highs so the overall ratio lands in band
    const hiIdx = Math.floor(
      pool.length * (0.55 + Math.random() * 0.4),
    );
    const hi = pool[Math.min(hiIdx, pool.length - 1)]!;
    const minLoCost = hi.cost / target.max;
    const maxLoCost = hi.cost / target.min;
    const loCandidates = pool.filter(
      (c) =>
        c.cost >= minLoCost * 0.9 &&
        c.cost <= maxLoCost * 1.1 &&
        c.cost < hi.cost,
    );
    if (loCandidates.length === 0) continue;
    const lo = loCandidates[Math.floor(Math.random() * loCandidates.length)]!;

    const midBand = pool.filter(
      (c) => c.cost > lo.cost && c.cost < hi.cost,
    );
    const picked: PricedCombo[] = [lo];
    if (count === 2) {
      picked.push(hi);
    } else {
      // Geometric steps between lo and hi
      for (let i = 1; i < count - 1; i++) {
        const t = i / (count - 1);
        const want = lo.cost * Math.pow(hi.cost / lo.cost, t);
        let best: PricedCombo | null = null;
        let bestDist = Infinity;
        for (const c of midBand) {
          if (picked.some((p) => p.id === c.id || p.cost === c.cost)) continue;
          const d = Math.abs(Math.log(c.cost / want));
          if (d < bestDist) {
            bestDist = d;
            best = c;
          }
        }
        if (!best) break;
        picked.push(best);
      }
      picked.push(hi);
    }

    if (picked.length < count) continue;
    const r = handRatio(picked);
    if (r >= target.min * 0.85 && r <= target.max * 1.2) return picked;
  }
  return null;
}

function pickNearBucket(
  pool: PricedCombo[],
  count: number,
  target: { min: number; max: number },
): PricedCombo[] | null {
  if (pool.length < count) return null;

  for (let attempt = 0; attempt < 80; attempt++) {
    const anchor = pool[Math.floor(Math.random() * pool.length)]!;
    const loTarget = anchor.cost / Math.sqrt(target.max);
    const hiTarget = anchor.cost * Math.sqrt(target.max);
    const candidates = pool.filter(
      (c) => c.cost >= loTarget * 0.85 && c.cost <= hiTarget * 1.15,
    );
    if (candidates.length < count) continue;

    const sorted = candidates.slice().sort((a, b) => a.cost - b.cost);
    const picked: PricedCombo[] = [];
    const used = new Set<string>();

    const seed = sorted[Math.floor(Math.random() * sorted.length)]!;
    picked.push(seed);
    used.add(seed.id);

    while (picked.length < count) {
      let best: PricedCombo | null = null;
      let bestScore = -1;
      for (const c of sorted) {
        if (used.has(c.id)) continue;
        if (picked.some((p) => p.cost === c.cost)) continue;
        const trial = [...picked, c];
        const r = handRatio(trial);
        const mid = (target.min + target.max) / 2;
        const ratioScore = 1 / (1 + Math.abs(Math.log(r / mid)));
        const minDist = Math.min(
          ...picked.map((p) => Math.abs(Math.log(c.cost / p.cost))),
        );
        const score = ratioScore * 2 + minDist;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (!best) break;
      picked.push(best);
      used.add(best.id);
    }

    if (picked.length < count) continue;
    const r = handRatio(picked);
    if (r >= target.min && r <= target.max) return picked;
    if (attempt > 50 && r >= target.min * 0.9 && r <= target.max * 1.15) {
      return picked;
    }
  }
  return null;
}

function fallbackSpread(pool: PricedCombo[], count: number): PricedCombo[] {
  if (pool.length <= count) return pool.slice();
  const out: PricedCombo[] = [];
  const usedCosts = new Set<number>();
  const step = (pool.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    let idx = Math.round(i * step);
    let guard = 0;
    while (usedCosts.has(pool[idx]!.cost) && guard < pool.length) {
      idx = (idx + 1) % pool.length;
      guard++;
    }
    out.push(pool[idx]!);
    usedCosts.add(pool[idx]!.cost);
  }
  return out;
}

/** Build a hand; later rounds add towers and tighten cost gaps. */
export function createOrderUpRound(round: number): OrderUpRound {
  const pool = getPool();
  const n = handSizeForRound(round);
  const target = targetCostRatio(round);
  // Wide early targets: space across the range. Later: cluster nearer costs.
  const preferWide = target.min >= 2.2;
  const picked =
    (preferWide
      ? pickWideSpread(pool, n, target)
      : pickNearBucket(pool, n, target)) ??
    pickNearBucket(pool, n, target) ??
    pickWideSpread(pool, n, target) ??
    fallbackSpread(pool, n);

  const sorted = picked.slice().sort((a, b) => a.cost - b.cost);
  return {
    round,
    items: shuffle(picked),
    correctIds: sorted.map((c) => c.id),
  };
}

export function isCorrectOrder(
  orderIds: string[],
  correctIds: string[],
): boolean {
  if (orderIds.length !== correctIds.length) return false;
  return orderIds.every((id, i) => id === correctIds[i]);
}

/** How many slots match the correct cheapest→pricey ranking. */
export function countCorrectPositions(
  orderIds: string[],
  correctIds: string[],
): number {
  const n = Math.min(orderIds.length, correctIds.length);
  let hit = 0;
  for (let i = 0; i < n; i++) {
    if (orderIds[i] === correctIds[i]) hit += 1;
  }
  return hit;
}
