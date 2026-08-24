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

/**
 * Partial credit for towers already in the right slot.
 * Perfect order → full payout. Misses still pay for greens (no streak bonus).
 */
export function pointsForPlacement(input: {
  round: number;
  placedCorrect: number;
  handSize: number;
  perfect: boolean;
  streakAfter: number;
  streakBonusPct?: number;
}): number {
  const hand = Math.max(1, input.handSize);
  const placed = Math.max(0, Math.min(hand, input.placedCorrect));
  if (placed <= 0) return 0;
  const full = pointsForCorrect(
    input.round,
    input.perfect ? input.streakAfter : 0,
    input.perfect ? (input.streakBonusPct ?? 0) : 0,
  );
  if (input.perfect || placed >= hand) return full;
  // Scale by share correct - e.g. 3/5 ≈ 60% of the round payout.
  return Math.max(1, Math.round((full * placed) / hand));
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
  // 3 towers - very different
  if (round <= 2) return { min: 8, max: 80 };
  if (round === 3) return { min: 4.5, max: 30 };
  // 4 towers - still clear
  if (round <= 5) return { min: 3, max: 14 };
  if (round === 6) return { min: 2.2, max: 7 };
  // 5 towers - still readable, then slowly closer
  if (round <= 8) return { min: 1.85, max: 4.5 };
  if (round <= 10) return { min: 1.4, max: 2.6 };
  // free play keeps squeezing gently
  if (round <= 14) return { min: 1.22, max: 2.0 };
  return { min: 1.12, max: 1.55 };
}
