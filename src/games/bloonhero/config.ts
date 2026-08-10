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

/** Base judgment windows (seconds from note time). Scaled per difficulty. */
export const WINDOW_PERFECT = 0.055;
export const WINDOW_GREAT = 0.105;
export const WINDOW_GOOD = 0.16;

export const HERO_LIVES = 5;
/** Clear threshold: hit ratio among chart notes. */
export const HERO_CLEAR_RATIO = 0.6;

export const CASH_PER_PERFECT = 12;
export const CASH_PER_GREAT = 8;
export const CASH_PER_GOOD = 4;
export const HERO_CLEAR_BONUS = 500;

export const BLOON_IMAGES = [
  "/images/bloons/red-bloon.webp",
  "/images/bloons/blue-bloon.webp",
  "/images/bloons/green-bloon.webp",
  "/images/bloons/pink-bloon.webp",
] as const;

export function scaledWindows(scale: number) {
  return {
    perfect: WINDOW_PERFECT * scale,
    great: WINDOW_GREAT * scale,
    good: WINDOW_GOOD * scale,
  };
}

export function judgeOffsetAt(
  dt: number,
  windows: { perfect: number; great: number; good: number },
): Judge | null {
  const a = Math.abs(dt);
  if (a <= windows.perfect) return "perfect";
  if (a <= windows.great) return "great";
  if (a <= windows.good) return "good";
  return null;
}
