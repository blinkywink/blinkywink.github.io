import { SHARED_RUN, rewardForCorrect } from "../rewards";

export const PRICE_CHECK_CONFIG = {
  roundsPerRun: SHARED_RUN.roundsPerRun,
  maxLives: SHARED_RUN.maxLives,
  /** Cap towers shown on each side (escalates by round). */
  maxSideSize: 5,
  /** Seconds to pick the higher-cost side. */
  timerSeconds: 10,
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
