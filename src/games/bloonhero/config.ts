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

/** Perfect-clear cash for a 3-minute song. */
export const HERO_CASH_AT_3MIN = 1800;
/** Perfect-clear cash for a 6-minute song. */
export const HERO_CASH_AT_6MIN = 4000;
/** Soft floor / ceiling so tiny intros and marathon charts stay sane. */
export const HERO_CASH_MIN = 400;
export const HERO_CASH_MAX = 8000;

/** Share of the duration pool earned from note hits (perfect run). */
const HERO_HIT_SHARE = 2200 / 3000;
/** Share for finishing the song. */
const HERO_CLEAR_SHARE = 500 / 3000;

export type HeroCashPools = {
  max: number;
  hitPool: number;
  clearBonus: number;
  goodBonus: number;
};

/**
 * Max cash for a perfect clear, scaled by song length.
 * Anchors: 3 min → 1800, 6 min → 4000 (linear between / beyond).
 */
export function heroMaxCashForDuration(durationSec: number): number {
  const minutes = Math.max(0, durationSec) / 60;
  const slope = (HERO_CASH_AT_6MIN - HERO_CASH_AT_3MIN) / 3; // per minute
  const intercept = HERO_CASH_AT_3MIN - slope * 3;
  const raw = intercept + slope * minutes;
  return Math.round(Math.min(HERO_CASH_MAX, Math.max(HERO_CASH_MIN, raw)));
}

export function heroCashPools(durationSec: number): HeroCashPools {
  const max = heroMaxCashForDuration(durationSec);
  const hitPool = Math.round(max * HERO_HIT_SHARE);
  const clearBonus = Math.round(max * HERO_CLEAR_SHARE);
  const goodBonus = Math.max(0, max - hitPool - clearBonus);
  return { max, hitPool, clearBonus, goodBonus };
}

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
