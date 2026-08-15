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
 * Rough player-market ask band. T5s sit around 17k–25k+. Paragons start
 * ~80–100k at degree 1 (the pull) and climb with tower-pack grind.
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
    if (off >= 2) {
      low = 22_000;
      high = 30_000;
    } else if (off === 1) {
      low = 18_500;
      high = 24_000;
    } else {
      low = 17_000;
      high = 21_000;
    }
  } else if (tier === 4) {
    low = off >= 2 ? 8_500 : off === 1 ? 7_200 : 6_500;
    high = off >= 2 ? 13_500 : off === 1 ? 11_500 : 10_500;
  } else if (tier === 3) {
    low = off >= 2 ? 3_200 : 2_200;
    high = off >= 2 ? 6_000 : 5_000;
  } else if (tier === 2) {
    low = 800;
    high = off >= 2 ? 2_400 : 2_000;
  } else if (tier === 1) {
    low = 350;
    high = 900;
  } else {
    low = 180;
    high = 450;
  }

  return {
    low: roundCash(low),
    high: roundCash(high),
    mid: roundCash((low + high) / 2),
  };
}

export function formatListingRange(range: ListingPriceRange): string {
  return `${range.low.toLocaleString()}–${range.high.toLocaleString()}`;
}
