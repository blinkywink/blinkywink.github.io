import { SHARED_RUN, rewardForCorrect } from "../rewards";

export const CAMO_IMAGE = "/images/bloons/camo-bloon.webp";

export const CAMO_CONFIG = {
  roundsPerRun: SHARED_RUN.roundsPerRun,
  maxLives: SHARED_RUN.maxLives,
  /** Largest N×N board. */
  maxGrid: 6,
  /** Soft cap on camo bloons per round. */
  maxCamo: 12,
  /** Recall phase timer (seconds). */
  recallSeconds: 20,
} as const;

/** Grid edge length for this round — grows slowly from 4×4. */
export function gridSizeForRound(round: number): number {
  // 1–3: 4 | 4–6: 5 | 7+: 6
  if (round <= 3) return 4;
  if (round <= 6) return 5;
  return Math.min(CAMO_CONFIG.maxGrid, 6);
}

/** How many camo cells flash this round. */
export function camoCountForRound(round: number, grid: number): number {
  const cells = grid * grid;
  // Start at 3, climb toward ~45% of the board.
  const base = 3 + Math.floor((round - 1) / 2);
  return Math.min(CAMO_CONFIG.maxCamo, cells - 1, Math.max(3, base));
}

/** How long camo stay visible before they vanish (ms). */
export function flashMsForRound(round: number): number {
  // Snappy from round 1 — gets tighter later.
  return Math.max(420, 950 - (round - 1) * 70);
}

export function pointsForCorrect(round: number, streakAfter: number): number {
  return Math.max(
    1,
    Math.round(rewardForCorrect({ round, streakAfter }) * 0.65),
  );
}
