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
/**
 * Letter-only length after stripping spaces/punctuation.
 * Board tiles shrink with `--bloonle-n`, so longer T5 names are fine.
 * Keep a cap so extremes like "Plasma Monkey Fan Club" stay out.
 */
const MAX_SLUG = 16;

function isExcludedName(_name: string, slug: string): boolean {
  return slug.length < MIN_SLUG || slug.length > MAX_SLUG;
}

function isBloonleEntity(entity: TowerEntity): boolean {
  if (entity.type === "tower") return true;
  return entity.type === "upgrade" && entity.tier === 5;
}

function buildPool(): BloonlePuzzle[] {
  const seen = new Set<string>();
  const out: BloonlePuzzle[] = [];
  for (const entity of towerEntities) {
    if (!isBloonleEntity(entity)) continue;
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

/** UTC calendar day key YYYY-MM-DD (matches daily Cash claims). */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Days since UTC epoch for the calendar date key. */
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

/** Deterministic index permutation for a cycle (Spotify-style no-recent-repeat). */
function cycleOrder(poolSize: number, cycle: number): number[] {
  const indices = Array.from({ length: poolSize }, (_, i) => i);
  return seededShuffle(indices, hashDay(`bloonle-cycle-v2-${cycle}`));
}

/**
 * Daily answer — walks a shuffled full-pool cycle so nothing repeats until
 * every word has appeared once (~pool size days), then reshuffles.
 * Same day → same answer for everyone (deterministic).
 */
export function puzzleForDay(key: string): BloonlePuzzle {
  const n = BLOONLE_POOL.length;
  const day = dayNumber(key);
  const cycle = Math.floor(day / n);
  const offset = ((day % n) + n) % n;
  const order = cycleOrder(n, cycle);
  return BLOONLE_POOL[order[offset]!]!;
}

/**
 * Practice pick — soft-avoid recent answers (weighted, Spotify-ish).
 * Recent slugs are much less likely; older ones can still appear.
 */
export function puzzlePractice(avoid: string[] = []): BloonlePuzzle {
  const recent = avoid.slice(-12);
  const weightOf = (slug: string): number => {
    const idx = recent.lastIndexOf(slug);
    if (idx < 0) return 8;
    const age = recent.length - 1 - idx; // 0 = just played
    if (age === 0) return 0.15;
    if (age <= 2) return 0.4;
    if (age <= 5) return 1;
    return 3;
  };

  let total = 0;
  const weights = BLOONLE_POOL.map((p) => {
    const w = weightOf(p.slug);
    total += w;
    return w;
  });
  if (total <= 0) {
    return BLOONLE_POOL[Math.floor(Math.random() * BLOONLE_POOL.length)]!;
  }
  let roll = Math.random() * total;
  for (let i = 0; i < BLOONLE_POOL.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return BLOONLE_POOL[i]!;
  }
  return BLOONLE_POOL[BLOONLE_POOL.length - 1]!;
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
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
}
