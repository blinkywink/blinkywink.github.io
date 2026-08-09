import type { DifficultyConfig } from "./config";
import { rewardForCorrect } from "../rewards";

export type ScoreBreakdown = {
  points: number;
  base: number;
  difficultyMultiplier: number;
  speedMultiplier: number;
  streakMultiplier: number;
  attemptMultiplier: number;
};

/**
 * Points / Cash for a correct Zoomed answer.
 * Uses the shared arcade payout so both games feel similar.
 */
export function calculateScore(
  difficulty: DifficultyConfig,
  _elapsedMs: number,
  streakAfterCorrect: number,
  attemptMultiplier = 1,
  round = 1,
): ScoreBreakdown {
  const points = rewardForCorrect({
    round,
    streakAfter: streakAfterCorrect,
    attemptMultiplier,
  });

  return {
    points,
    base: 100,
    difficultyMultiplier: difficulty.scoreMultiplier,
    speedMultiplier: 1,
    streakMultiplier: 1 + Math.min(streakAfterCorrect, 12) * 0.2,
    attemptMultiplier,
  };
}

export type RunStats = {
  score: number;
  bestStreak: number;
  correct: number;
  total: number;
  accuracy: number;
};

export type BestScores = {
  bestScore: number;
  bestStreak: number;
  bestAccuracy: number;
};

const STORAGE_KEY = "bloon-arcade:zoomed:bests";

export function loadBestScores(): BestScores {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { bestScore: 0, bestStreak: 0, bestAccuracy: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<BestScores>;
    return {
      bestScore: Number(parsed.bestScore) || 0,
      bestStreak: Number(parsed.bestStreak) || 0,
      bestAccuracy: Number(parsed.bestAccuracy) || 0,
    };
  } catch {
    return { bestScore: 0, bestStreak: 0, bestAccuracy: 0 };
  }
}

export function saveBestScores(stats: RunStats): BestScores {
  const prev = loadBestScores();
  const next: BestScores = {
    bestScore: Math.max(prev.bestScore, stats.score),
    bestStreak: Math.max(prev.bestStreak, stats.bestStreak),
    bestAccuracy: Math.max(prev.bestAccuracy, stats.accuracy),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function formatScore(n: number): string {
  return n.toLocaleString("en-US");
}
