import { pointsForCorrect as camoPoints } from "../camodetection/config";
import { pointsForCorrect as orderPoints } from "../orderup/config";
import { pointsForCorrect as pricePoints } from "../pricecheck/config";
import { rewardForCorrect } from "../rewards";
import { MIXUP_CONFIG, MIXUP_MEDIUM_ROUND, type MixupKind } from "./config";

/** Cash this medium question would pay first-try in its own game. */
export function mixupQuestionValue(kind: MixupKind): number {
  const round = MIXUP_MEDIUM_ROUND;
  switch (kind) {
    case "zoomed":
      // Zoomed pays 1.5× the shared curve.
      return Math.max(1, Math.round(rewardForCorrect({ round }) * 1.5));
    case "geoguessr":
      return rewardForCorrect({ round });
    case "pricecheck":
      return pricePoints(round, 1);
    case "orderup":
      return orderPoints(round, 1);
    case "camodetection":
      return camoPoints(round, 1);
  }
}

/** +60% on banked question Cash when the Mix Up finishes. */
export function mixupEndBonus(baseCash: number): number {
  if (!Number.isFinite(baseCash) || baseCash <= 0) return 0;
  return Math.round(baseCash * MIXUP_CONFIG.clearBonusRate);
}

export function mixupPayout(correctKinds: MixupKind[]): {
  base: number;
  bonus: number;
  total: number;
} {
  const base = correctKinds.reduce(
    (sum, kind) => sum + mixupQuestionValue(kind),
    0,
  );
  const bonus = mixupEndBonus(base);
  return { base, bonus, total: base + bonus };
}
