import { SHARED_RUN, rewardForCorrect } from "../rewards";

export const PRICE_CHECK_CONFIG = {
  roundsPerRun: SHARED_RUN.roundsPerRun,
  maxLives: SHARED_RUN.maxLives,
  /** Cap towers shown on each side (escalates by round). */
  maxSideSize: 5,
  /** Seconds to pick the higher-cost side. */
  timerSeconds: 10,
  /**
   * Wrong answer costs this × the correct-answer payout.
   * Above 1 so coin-flip (~50%) guessing loses Cash on average;
   * skilled play (clear majority correct) still nets positive.
   */
  wrongPenaltyRate: 1.25,
} as const;

/** How many towers each side may roll this round (grows over the run). */
export function sideSizeForRound(round: number): number {
  // 1–2: 1 | 3–4: 2 | 5–6: 3 | 7–8: 4 | 9+: 5
  return Math.min(
    PRICE_CHECK_CONFIG.maxSideSize,
    1 + Math.floor((round - 1) / 2),
  );
}

export function pointsForCorrect(
  round: number,
  streakAfter: number,
  streakBonusPct = 0,
): number {
  return Math.max(
    1,
    Math.round(
      rewardForCorrect({ round, streakAfter, streakBonusPct }) * 0.65,
    ),
  );
}

/** Cash lost on a miss — more than a hit pays, so random guessing bleeds. */
export function penaltyForWrong(round: number): number {
  const wouldEarn = pointsForCorrect(round, 0);
  return Math.max(
    1,
    Math.round(wouldEarn * PRICE_CHECK_CONFIG.wrongPenaltyRate),
  );
}
