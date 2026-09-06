import { suggestedParagonValue } from "./paragonProgress";
import { maxPathTier, type MonkeyCardSpec, type PathLevels } from "./pathCombos";

export type ListingPriceRange = {
  low: number;
  high: number;
  mid: number;
};

function roundCash(n: number): number {
  const x = Math.max(10, n);
  if (x >= 1_000_000) return Math.round(x / 5_000) * 5_000;
  if (x >= 100_000) return Math.round(x / 1_000) * 1_000;
  if (x >= 10_000) return Math.round(x / 500) * 500;
  if (x >= 1_000) return Math.round(x / 100) * 100;
  return Math.round(x / 10) * 10;
}

/** Off-path investment (the smaller of the two used paths). */
function offPath(levels: PathLevels): number {
  return [...levels].sort((a, b) => b - a)[1] ?? 0;
}

/**
 * Player-market ask band. Tuned near limited shop deals so people actually
 * buy (T5 limited is ~16.7k → market guide ~12k-18k, mid ~15k).
 * Paragons stay a step above via suggestedParagonValue.
 */
export function suggestedListingRange(
  card: MonkeyCardSpec,
  paragonDegree = 1,
): ListingPriceRange {
  if (card.isParagon) {
    const mid = suggestedParagonValue(paragonDegree);
    return {
      low: roundCash(mid * (80 / 90)),
      high: roundCash(mid * (100 / 90)),
      mid: roundCash(mid),
    };
  }

  const tier = maxPathTier(card.pathLevels);
  const off = offPath(card.pathLevels);

  let low: number;
  let high: number;
  if (tier >= 5) {
    // Limited T5 ≈ 16.7k — market wants a deal / seed, not 40k+.
    if (off >= 2) {
      low = 14_000;
      high = 18_500;
    } else if (off === 1) {
      low = 12_500;
      high = 17_000;
    } else {
      low = 11_500;
      high = 15_500;
    }
  } else if (tier === 4) {
    // Limited T4 ≈ 5.2k.
    low = off >= 2 ? 4_200 : off === 1 ? 3_600 : 3_200;
    high = off >= 2 ? 6_200 : off === 1 ? 5_400 : 4_800;
  } else if (tier === 3) {
    low = off >= 2 ? 1_200 : 900;
    high = off >= 2 ? 2_400 : 1_900;
  } else if (tier === 2) {
    low = 350;
    high = off >= 2 ? 900 : 750;
  } else if (tier === 1) {
    low = 150;
    high = 400;
  } else {
    low = 80;
    high = 200;
  }

  return {
    low: roundCash(low),
    high: roundCash(high),
    mid: roundCash((low + high) / 2),
  };
}

export function formatListingRange(range: ListingPriceRange): string {
  return `${range.low.toLocaleString()}-${range.high.toLocaleString()}`;
}
