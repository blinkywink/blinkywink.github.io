import type { ChartNote } from "./parseChartFile";

export type { ChartNote };
export type Judge = "perfect" | "great" | "good" | "miss";

/** Travel time from top of highway to the hit line at 1× speed. */
export const APPROACH_S = 1.85;
/** Hit line height (%). One depth-grid row below 70 so receptor sits lower. */
export const HIT_LINE_Y = 80;
export const SPAWN_Y = -8;
export const LEAD_IN_BEATS = 4;

export const WINDOW_PERFECT = 0.055;
export const WINDOW_GREAT = 0.1;
export const WINDOW_GOOD = 0.16;

export const HERO_LIVES = 5;
/** Hit accuracy needed after finishing a song for the bonus pack / cash. */
export const HERO_BONUS_RATIO = 0.65;
/** Consecutive empty taps before you lose one strike. */
export const EMPTY_STREAK_PER_LIFE = 8;
/** Absolute cash ceiling for one Bloon Hero run. */
export const HERO_MAX_CASH = 3000;
/**
 * Max cash from note hits if every chart note is Perfect.
 * Scaled by note count so long charts don't print money.
 */
export const HERO_HIT_POOL = 2200;
/** Cash for finishing the whole song (clear). */
export const HERO_CLEAR_BONUS = 500;
/** Extra cash when you clear and hit the accuracy bonus threshold. */
export const HERO_GOOD_BONUS = 300;

/** Relative hit quality vs a Perfect (used when scaling the hit pool). */
export const HIT_WEIGHT = {
  perfect: 1,
  great: 5 / 8,
  good: 3 / 8,
  miss: 0,
} as const;

/** Lane bloon art. */
export const BLOON_IMAGES = [
  "/images/bloons/green-bloon.webp",
  "/images/bloons/red-bloon.webp",
  "/images/bloons/pink-bloon.webp",
  "/images/bloons/blue-bloon.webp",
  "/images/bloons/purple-bloon.webp",
] as const;

/** 5 frets: D F J K L */
export const LANES = [
  { id: 0, key: "d", label: "D", color: "#22c55e" },
  { id: 1, key: "f", label: "F", color: "#ef4444" },
  { id: 2, key: "j", label: "J", color: "#f472b6" },
  { id: 3, key: "k", label: "K", color: "#3b82f6" },
  { id: 4, key: "l", label: "L", color: "#a855f7" },
] as const;

export const KEY_TO_LANE: Record<string, number> = {
  d: 0,
  f: 1,
  j: 2,
  k: 3,
  l: 4,
};

export function leadInSeconds(bpm = 120): number {
  return (60 / bpm) * LEAD_IN_BEATS;
}

export function judgeOffset(dt: number): Judge | null {
  const a = Math.abs(dt);
  if (a <= WINDOW_PERFECT) return "perfect";
  if (a <= WINDOW_GREAT) return "great";
  if (a <= WINDOW_GOOD) return "good";
  return null;
}

export function noteY(songTime: number, noteT: number, approach = APPROACH_S): number {
  const u = (noteT - songTime) / approach;
  const clamped = Math.min(1, Math.max(0, u));
  return SPAWN_Y + (1 - clamped) * (HIT_LINE_Y - SPAWN_Y);
}
