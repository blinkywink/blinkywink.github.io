import { SHARED_RUN, rewardForCorrect } from "../rewards";

export const ORDER_UP_CONFIG = {
  roundsPerRun: SHARED_RUN.roundsPerRun,
  maxLives: SHARED_RUN.maxLives,
  /** Seconds to sort cheapest → most expensive. */
  timerSeconds: 10,
} as const;

export function pointsForCorrect(
  round: number,
  streakAfter: number,
  streakBonusPct = 0,
): number {
  return rewardForCorrect({ round, streakAfter, streakBonusPct });
}

/** Hand grows 3 → 4 → 5 as the run progresses. */
export function handSizeForRound(round: number): number {
  if (round <= 3) return 3;
  if (round <= 6) return 4;
  return 5;
}

/**
 * Target max/min cost ratio for the hand.
 * Early = obvious gaps; only late rounds get near-ties.
 */
export function targetCostRatio(round: number): { min: number; max: number } {
  // 3 towers — very different
  if (round <= 2) return { min: 8, max: 80 };
  if (round === 3) return { min: 4.5, max: 30 };
  // 4 towers — still clear
  if (round <= 5) return { min: 3, max: 14 };
  if (round === 6) return { min: 2.2, max: 7 };
  // 5 towers — still readable, then slowly closer
  if (round <= 8) return { min: 1.85, max: 4.5 };
  if (round <= 10) return { min: 1.4, max: 2.6 };
  // free play keeps squeezing gently
  if (round <= 14) return { min: 1.22, max: 2.0 };
  return { min: 1.12, max: 1.55 };
}
