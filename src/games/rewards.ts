/** Shared arcade-run rules for Zoomed, Price Check, etc. */
export const SHARED_RUN = {
  roundsPerRun: 10,
  maxLives: 5,
  /** Spend this many Cash to refill lives and keep going. */
  continueCost: 100,
} as const;

/** Bonus tower-pack pick when you get this many right in a 10-round quiz. */
export const QUIZ_BONUS_MIN_CORRECT = 7;

export function earnsQuizBonusPack(correctCount: number): boolean {
  return correctCount >= QUIZ_BONUS_MIN_CORRECT;
}

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
  /** Streak after this correct answer (used by Gwendolin L1). */
  streakAfter?: number;
  /** 1 = first try; &lt;1 reduces payout (Zoomed retries). */
  attemptMultiplier?: number;
  /** Absolute streak Cash bonus (e.g. 0.03 = +3% when streak ≥ 2). */
  streakBonusPct?: number;
}): number {
  const round = Math.max(1, Math.floor(input.round));
  const progress = REWARD_CURVE.progressMult ** (round - 1);
  const mult = input.attemptMultiplier ?? 1;
  const raw = REWARD_CURVE.base * progress * Math.max(0, mult);
  let capped = Math.min(REWARD_CURVE.perHitCap, Math.round(raw));
  const streak = input.streakAfter ?? 0;
  const bonusPct = input.streakBonusPct ?? 0;
  if (streak >= 2 && bonusPct > 0) {
    capped = Math.max(0, Math.round(capped * (1 + bonusPct)));
  }
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

/**
 * Flawless quiz clear: finished the run without spending a life
 * (and without using the paid continue).
 */
export function isFlawlessClear(input: {
  cleared: boolean;
  freePlay: boolean;
  lives: number;
  maxLives: number;
}): boolean {
  return (
    input.cleared &&
    !input.freePlay &&
    input.lives >= input.maxLives
  );
}

/** Extra Cash on a flawless clear — doubles what you banked that run. */
export function perfectRunBonus(runCash: number): number {
  if (!Number.isFinite(runCash) || runCash <= 0) return 0;
  return Math.round(runCash);
}

/** Bloonle daily solve — hard cap. */
export function bloonleDailyReward(): number {
  return 3000;
}

/** Practice puzzles — hard cap. */
export function bloonlePracticeReward(): number {
  return 2500;
}

/** Faster solves pay more, never above the mode cap. First try is the max. */
export function bloonleSolveReward(
  mode: "daily" | "practice",
  guessCount: number,
): number {
  const cap =
    mode === "daily" ? bloonleDailyReward() : bloonlePracticeReward();
  const guesses = Math.max(1, Math.floor(guessCount));
  const mult =
    guesses <= 1 ? 1 : guesses === 2 ? 0.85 : guesses === 3 ? 0.7 : 0.55;
  return Math.min(cap, Math.round(cap * mult));
}
