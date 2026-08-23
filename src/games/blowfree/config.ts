/** Blow Free — daily Flow Free with colored bloons. */

export type BlowColor =
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "pink"
  | "purple"
  | "black"
  | "white";

export const BLOW_COLORS: BlowColor[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "black",
  "white",
];

export const BLOW_IMGS: Record<BlowColor, string> = {
  red: "/images/bloons/btd6/red.webp",
  blue: "/images/bloons/btd6/blue.webp",
  green: "/images/bloons/btd6/green.webp",
  yellow: "/images/bloons/btd6/yellow.webp",
  pink: "/images/bloons/btd6/pink.webp",
  purple: "/images/bloons/btd6/purple.webp",
  black: "/images/bloons/btd6/black.webp",
  white: "/images/bloons/btd6/white.webp",
};

export const BLOW_PIPE: Record<BlowColor, string> = {
  red: "#ff5a5a",
  blue: "#5a9fff",
  green: "#6fd99a",
  yellow: "#ffe566",
  pink: "#ff7ab8",
  purple: "#b07cff",
  black: "#4a4a54",
  white: "#e8e8f0",
};

export type Cell = { r: number; c: number };

export type BlowPair = {
  color: BlowColor;
  a: Cell;
  b: Cell;
};

export type BlowLevel = {
  id: string;
  size: number;
  pairs: BlowPair[];
};

/** Decent size — long enough to think, not a phone-zoom nightmare. */
export const BLOW_DAILY_SIZE = 9;
export const BLOW_DAILY_PAIRS = 8;
export const BLOW_PRACTICE_SIZE = 8;
export const BLOW_PRACTICE_PAIRS = 7;

export function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.r === b.r && a.c === b.c;
}

export function isAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/** UTC calendar day key YYYY-MM-DD. */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function nextMidnightMs(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function hashDay(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
