import { SHARED_RUN } from "../rewards";

export const CAMO_IMAGE = "/images/bloons/camo-bloon.webp";

/** Endless: dying after this many rounds still counts as a clear for packs. */
export const CAMO_CLEAR_ROUNDS = 10;

export const CAMO_CONFIG = {
  maxLives: SHARED_RUN.maxLives,
  /** Largest N×N board. */
  maxGrid: 6,
  /** Soft cap on camo bloons per round. */
  maxCamo: 14,
  /** Base recall phase timer (seconds). Shrinks slowly on later rounds. */
  recallSeconds: 22,
} as const;

/** Grid edge length for this round. */
export function gridSizeForRound(round: number): number {
  if (round <= 5) return 4;
  if (round <= 14) return 5;
  return Math.min(CAMO_CONFIG.maxGrid, 6);
}

/** How many camo cells flash this round. */
export function camoCountForRound(round: number, grid: number): number {
  const cells = grid * grid;
  // +1 camo about every 3 rounds.
  const base = 3 + Math.floor((round - 1) / 3);
  return Math.min(CAMO_CONFIG.maxCamo, cells - 1, Math.max(3, base));
}

/** How long camo stay visible before they vanish (ms). */
export function flashMsForRound(round: number): number {
  // Gentle drop: still comfortable through the teens.
  return Math.max(420, 1100 - (round - 1) * 28);
}

/** Recall window in seconds. Stays generous for a long stretch. */
export function recallSecondsForRound(round: number): number {
  if (round <= 15) return CAMO_CONFIG.recallSeconds;
  return Math.max(
    12,
    CAMO_CONFIG.recallSeconds - Math.floor((round - 15) / 4),
  );
}

/** Cash for a correct recall — tied to board size. */
export function pointsForCorrect(
  round: number,
  streakAfter: number,
  streakBonusPct = 0,
): number {
  const grid = gridSizeForRound(round);
  let payout = grid <= 4 ? 60 : grid <= 5 ? 100 : 200;
  // Soft climb once you're on the biggest board.
  if (grid >= 6) {
    payout += Math.floor(Math.max(0, round - 15) / 5) * 25;
  }
  payout = Math.min(400, payout);
  if (streakAfter >= 2 && streakBonusPct > 0) {
    payout = Math.round(payout * (1 + streakBonusPct));
  }
  return Math.max(1, payout);
}
