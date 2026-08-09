/** Shared arcade-run rules for Zoomed, Price Check, etc. */
export const SHARED_RUN = {
  roundsPerRun: 10,
  maxLives: 5,
  /** Spend this many Cash to refill lives and keep going. */
  continueCost: 100,
} as const;

/**
 * Cash curve for timed / quiz games.
 * Round 1 pays `base`; each later question multiplies by `progressMult`
 * (survive & push forward). Per-hit amount never exceeds `perHitCap`
 * so free play can't print infinite Cash.
 */
export const REWARD_CURVE = {
  /** Cash for a first-try clear on round 1. */
  base: 100,
  /** Multiply payout each successive round you reach. */
  progressMult: 1.25,
  /** Hard cap on a single correct answer. */
  perHitCap: 350,
} as const;

/**
 * Cash for one correct answer.
 * Progress scales with round number; retries may reduce via attemptMultiplier.
 */
export function rewardForCorrect(input: {
  round: number;
  /** Kept for call-site compat — progress uses round, not streak. */
  streakAfter?: number;
  /** 1 = first try; &lt;1 reduces payout (Zoomed retries). */
  attemptMultiplier?: number;
}): number {
  const round = Math.max(1, Math.floor(input.round));
  const progress = REWARD_CURVE.progressMult ** (round - 1);
  const mult = input.attemptMultiplier ?? 1;
  const raw = REWARD_CURVE.base * progress * Math.max(0, mult);
  const capped = Math.min(REWARD_CURVE.perHitCap, Math.round(raw));
  return Math.max(0, capped);
}

/** Total Cash for clearing every round first-try (no misses). */
export function perfectRunCash(
  rounds: number = SHARED_RUN.roundsPerRun,
): number {
  let total = 0;
  for (let r = 1; r <= rounds; r++) {
    total += rewardForCorrect({ round: r, attemptMultiplier: 1 });
  }
  return total;
}

/** Bloonle daily solve = one full perfect quiz run. */
export function bloonleDailyReward(): number {
  return perfectRunCash();
}

/** Practice puzzles pay a slice of the daily clear. */
export function bloonlePracticeReward(): number {
  return Math.max(50, Math.round(perfectRunCash() * 0.3));
}
