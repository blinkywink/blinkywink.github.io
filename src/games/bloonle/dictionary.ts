import { towerEntities } from "../../data/towers";
import type { TowerEntity } from "../../data/types";
import { bloonleDailyReward, bloonlePracticeReward } from "../rewards";

/** Strip to lowercase a–z only (no spaces, dashes, etc.). */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

export type BloonlePuzzle = {
  /** Letter-only slug used for Wordle matching. */
  slug: string;
  displayName: string;
  entity: TowerEntity;
};

const MIN_SLUG = 5;
/** Long enough for variety; still a readable Wordle row. */
const MAX_SLUG = 12;

/** Formal / obvious titles that aren't fun to type as one blob. */
function isExcludedName(name: string, slug: string): boolean {
  if (slug.length < MIN_SLUG || slug.length > MAX_SLUG) return true;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  if (/^the\s/i.test(name)) return true;
  return false;
}

function buildPool(): BloonlePuzzle[] {
  const seen = new Set<string>();
  const out: BloonlePuzzle[] = [];
  for (const entity of towerEntities) {
    const slug = normalizeName(entity.name);
    if (isExcludedName(entity.name, slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, displayName: entity.name, entity });
  }
  // Stable shuffle so consecutive days aren't alphabetical neighbors
  return seededShuffle(out, 0xb1001e);
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export const BLOONLE_POOL: BloonlePuzzle[] = buildPool();

/** All valid guess slugs (same length required at submit time). */
export const BLOONLE_DICT = new Set(BLOONLE_POOL.map((p) => p.slug));

export const BLOONLE_CONFIG = {
  maxGuesses: 6,
  /** Solving the daily (any guess count ≤ 6) pays a full perfect-run. */
  get dailySolveReward() {
    return bloonleDailyReward();
  },
  /** Practice pays less than the daily. */
  get practiceSolveReward() {
    return bloonlePracticeReward();
  },
} as const;

/** Local calendar day key YYYY-MM-DD. */
export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Days since UTC epoch for the local calendar date. */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

function hashDay(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function puzzleForDay(key: string): BloonlePuzzle {
  const idx = hashDay(key) % BLOONLE_POOL.length;
  return BLOONLE_POOL[idx]!;
}

/** Random practice puzzle; optionally avoid a few recent slugs. */
export function puzzlePractice(avoid: string[] = []): BloonlePuzzle {
  const blocked = new Set(avoid);
  const options = BLOONLE_POOL.filter((p) => !blocked.has(p.slug));
  const pool = options.length > 0 ? options : BLOONLE_POOL;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export type LetterMark = "correct" | "present" | "absent";

/** Classic Wordle tile evaluation (handles duplicate letters). */
export function evaluateGuess(guess: string, answer: string): LetterMark[] {
  const n = answer.length;
  const marks: LetterMark[] = Array.from({ length: n }, () => "absent");
  const rem = answer.split("");

  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      marks[i] = "correct";
      rem[i] = "";
    }
  }
  for (let i = 0; i < n; i++) {
    if (marks[i] === "correct") continue;
    const ch = guess[i]!;
    const j = rem.indexOf(ch);
    if (j >= 0) {
      marks[i] = "present";
      rem[j] = "";
    }
  }
  return marks;
}

export function nextMidnightMs(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}
