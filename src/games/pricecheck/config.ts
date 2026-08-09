import { SHARED_RUN, rewardForCorrect } from "../rewards";

export const PRICE_CHECK_CONFIG = {
  roundsPerRun: SHARED_RUN.roundsPerRun,
  maxLives: SHARED_RUN.maxLives,
  /** Cap towers shown on each side (escalates by round). */
  maxSideSize: 5,
  /** Seconds to pick the higher-cost side. */
  timerSeconds: 10,
  /** Wrong answer costs this fraction of the correct-answer payout. */
  wrongPenaltyRate: 0.33,
} as const;

/** How many towers each side may roll this round (grows over the run). */
export function sideSizeForRound(round: number): number {
  // 1–2: 1 | 3–4: 2 | 5–6: 3 | 7–8: 4 | 9+: 5
  return Math.min(
    PRICE_CHECK_CONFIG.maxSideSize,
    1 + Math.floor((round - 1) / 2),
  );
}

export function pointsForCorrect(round: number, streakAfter: number): number {
  return rewardForCorrect({ round, streakAfter });
}

/** Cash lost on a miss — 33% of what a correct answer would have paid. */
export function penaltyForWrong(round: number): number {
  const wouldEarn = pointsForCorrect(round, 0);
  return Math.max(1, Math.round(wouldEarn * PRICE_CHECK_CONFIG.wrongPenaltyRate));
}
