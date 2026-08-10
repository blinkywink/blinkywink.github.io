import chart from "./data/partyTimeChart.json";

export const CHART = chart;

export const APPROACH_S = 1.55;
/** Judgment windows (seconds from note time). */
export const WINDOW_PERFECT = 0.05;
export const WINDOW_GREAT = 0.095;
export const WINDOW_GOOD = 0.145;

export const HERO_LIVES = 3;
/** Clear threshold: hit ratio among chart notes. */
export const HERO_CLEAR_RATIO = 0.65;

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

export type Judge = "perfect" | "great" | "good" | "miss";

export function judgeOffset(dt: number): Judge | null {
  const a = Math.abs(dt);
  if (a <= WINDOW_PERFECT) return "perfect";
  if (a <= WINDOW_GREAT) return "great";
  if (a <= WINDOW_GOOD) return "good";
  return null;
}
