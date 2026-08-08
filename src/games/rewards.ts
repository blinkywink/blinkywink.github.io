/** Shared arcade-run rules for Zoomed, Price Check, etc. */
export const SHARED_RUN = {
  roundsPerRun: 10,
  maxLives: 5,
  /** Spend this many Cash to refill lives and keep going. */
  continueCost: 100,
} as const;

/**
 * Cash (and score) for a correct answer.
 * Same formula for every game so payouts feel aligned.
 */
export function rewardForCorrect(input: {
  round: number;
  streakAfter: number;
  /** 1 = first try; &lt;1 reduces payout (Zoomed retries). */
  attemptMultiplier?: number;
}): number {
  const streakBonus = Math.min(Math.max(input.streakAfter, 0), 12) * 20;
  const roundBonus = Math.min(Math.max(input.round, 1), 30) * 12;
  const mult = input.attemptMultiplier ?? 1;
  const raw = (100 + streakBonus + roundBonus) * mult;
  return Math.max(25, Math.round(raw));
}
