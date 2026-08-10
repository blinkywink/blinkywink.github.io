import chart from "./data/partyTimeChart.json";

export const CHART = chart;

export type Judge = "perfect" | "great" | "good" | "miss";

/** Travel time from top of highway to the hit line (~20% faster than 2.45). */
export const APPROACH_S = 2.04;
/** Count-in beats before chart t=0 (drums + countdown). */
export const LEAD_IN_BEATS = 4;
/** Hit-line Y as % of the lane (matches target / note geometry). */
export const HIT_LINE_Y = 82;
/** Note spawn Y (%); slightly above 0 so they enter from off-screen. */
export const SPAWN_Y = -10;
/** Min MIDI duration (s) before a note draws a sustain bar. */
export const HOLD_MIN_DUR = 0.2;

export function leadInSeconds(bpm: number): number {
  return (60 / bpm) * LEAD_IN_BEATS;
}

/** Sustain trail length as % of the lane height. */
export function sustainLenPct(dur: number, approach = APPROACH_S): number {
  if (dur < HOLD_MIN_DUR) return 0;
  const trackSpan = HIT_LINE_Y - SPAWN_Y;
  return Math.min(48, (dur / approach) * trackSpan * 1.15);
}

/** Judgment windows (seconds from note time). */
export const WINDOW_PERFECT = 0.07;
export const WINDOW_GREAT = 0.12;
export const WINDOW_GOOD = 0.18;

export const HERO_LIVES = 10;
/** Clear threshold: hit ratio among chart notes. */
export const HERO_CLEAR_RATIO = 0.55;
/**
 * Wrong / empty presses in a row before you instantly pop out.
 * Each wrong press after the first also costs a life.
 */
export const EMPTY_STREAK_KILL = 6;

export const CASH_PER_PERFECT = 14;
export const CASH_PER_GREAT = 9;
export const CASH_PER_GOOD = 5;
export const HERO_CLEAR_BONUS = 500;

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
