import type { ChartNote } from "./parseChartFile";

export type { ChartNote };
export type Judge = "perfect" | "great" | "good" | "miss";

/** Travel time from top of highway to the hit line at 1× speed. */
export const APPROACH_S = 1.85;
/** Hit line height (%). Raised so darts have room to fly up from below. */
export const HIT_LINE_Y = 70;
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
/** Cash for finishing the whole song (clear). */
export const HERO_CLEAR_BONUS = 400;
/** Extra cash when you clear and hit the accuracy bonus threshold. */
export const HERO_GOOD_BONUS = 350;

export const CASH_PER_PERFECT = 8;
export const CASH_PER_GREAT = 5;
export const CASH_PER_GOOD = 3;

/** 5 frets: D F J K L */
export const LANES = [
  { id: 0, key: "d", label: "D", color: "#22c55e" },
  { id: 1, key: "f", label: "F", color: "#ef4444" },
  { id: 2, key: "j", label: "J", color: "#eab308" },
  { id: 3, key: "k", label: "K", color: "#3b82f6" },
  { id: 4, key: "l", label: "L", color: "#f97316" },
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
