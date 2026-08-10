import chart from "./data/partyTimeChart.json";

export const CHART = chart;

export type Judge = "perfect" | "great" | "good" | "miss";

/** Travel time from top of highway to the hit line. */
export const APPROACH_S = 2.45;
/** Count-in beats before chart t=0 (drums + countdown). */
export const LEAD_IN_BEATS = 4;
/** Hit-line Y as % of the lane (matches target / note geometry). */
export const HIT_LINE_Y = 82;
/** Note spawn Y (%); slightly above 0 so they enter from off-screen. */
export const SPAWN_Y = -10;

export function leadInSeconds(bpm: number): number {
  return (60 / bpm) * LEAD_IN_BEATS;
}

/** Judgment windows (seconds from note time). */
export const WINDOW_PERFECT = 0.07;
export const WINDOW_GREAT = 0.12;
export const WINDOW_GOOD = 0.18;

export const HERO_LIVES = 10;
/** Clear threshold: hit ratio among chart notes. */
export const HERO_CLEAR_RATIO = 0.55;

export const CASH_PER_PERFECT = 14;
export const CASH_PER_GREAT = 9;
export const CASH_PER_GOOD = 5;
export const HERO_CLEAR_BONUS = 500;

export const BLOON_IMAGES = [
  "/images/bloons/red-bloon.webp",
  "/images/bloons/blue-bloon.webp",
  "/images/bloons/green-bloon.webp",
  "/images/bloons/pink-bloon.webp",
] as const;

export const WINDOWS = {
  perfect: WINDOW_PERFECT,
  great: WINDOW_GREAT,
  good: WINDOW_GOOD,
} as const;

export function judgeOffset(dt: number): Judge | null {
  const a = Math.abs(dt);
  if (a <= WINDOW_PERFECT) return "perfect";
  if (a <= WINDOW_GREAT) return "great";
  if (a <= WINDOW_GOOD) return "good";
  return null;
}
