import { towers } from "../../data/towers";
import { allLegalPathLevels, type PathLevels } from "../../lib/pathCombos";
import {
  buildPricedCombo,
  sideTotal,
  type PricedCombo,
} from "./costs";
import { sideSizeForRound } from "./config";

export type PriceSide = {
  combos: PricedCombo[];
  total: number;
};

export type PriceRound = {
  round: number;
  left: PriceSide;
  right: PriceSide;
  /** Which side is strictly more expensive. */
  answer: "left" | "right";
};

const LEGAL: PathLevels[] = allLegalPathLevels();
const TOWER_NAMES = towers.map((t) => t.tower);

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function pickSize(maxSize: number): number {
  // Bias toward the current ceiling so late rounds feel stacked
  if (maxSize <= 1) return 1;
  const roll = Math.random();
  if (roll < 0.45) return maxSize;
  if (roll < 0.75) return Math.max(1, maxSize - 1);
  return 1 + randInt(maxSize);
}

function randomCombo(used: Set<string>): PricedCombo {
  for (let attempt = 0; attempt < 80; attempt++) {
    const tower = TOWER_NAMES[randInt(TOWER_NAMES.length)]!;
    const levels = LEGAL[randInt(LEGAL.length)]!;
    const combo = buildPricedCombo(tower, levels);
    if (!combo || combo.cost <= 0) continue;
    if (used.has(combo.id)) continue;
    used.add(combo.id);
    return combo;
  }
  // Fallback: force base dart if RNG somehow fails
  const fallback = buildPricedCombo("Dart Monkey", [0, 0, 0])!;
  used.add(fallback.id);
  return fallback;
}

function buildSide(count: number, used: Set<string>): PriceSide {
  const combos: PricedCombo[] = [];
  for (let i = 0; i < count; i++) combos.push(randomCombo(used));
  return { combos, total: sideTotal(combos) };
}

/**
 * Build one left/right matchup. Retries until totals differ.
 * Later rounds prefer closer totals so “who’s higher” isn’t obvious.
 */
export function createPriceRound(round: number): PriceRound {
  const maxSize = sideSizeForRound(round);
  const preferClose = round >= 5;

  let best: PriceRound | null = null;
  let bestRatio = Infinity;

  for (let attempt = 0; attempt < 60; attempt++) {
    const used = new Set<string>();
    const left = buildSide(pickSize(maxSize), used);
    const right = buildSide(pickSize(maxSize), used);
    if (left.total === right.total) continue;

    const hi = Math.max(left.total, right.total);
    const lo = Math.min(left.total, right.total);
    const ratio = hi / Math.max(lo, 1);

    const candidate: PriceRound = {
      round,
      left,
      right,
      answer: left.total > right.total ? "left" : "right",
    };

    if (!preferClose) return candidate;

    // Prefer within ~15–80% of each other; keep tightest seen as fallback
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
    if (ratio <= 1.8 && ratio >= 1.05) return candidate;
  }

  return (
    best ?? {
      round,
      left: { combos: [buildPricedCombo("Dart Monkey", [0, 0, 0])!], total: 200 },
      right: {
        combos: [buildPricedCombo("Dart Monkey", [1, 0, 0])!],
        total: 340,
      },
      answer: "right",
    }
  );
}
