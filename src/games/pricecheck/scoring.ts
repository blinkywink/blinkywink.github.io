const STORAGE_KEY = "bloon-arcade:pricecheck:bests";

export type BestScores = {
  bestScore: number;
  bestStreak: number;
  bestAccuracy: number;
};

export type RunStats = {
  score: number;
  correct: number;
  total: number;
  accuracy: number;
  bestStreak: number;
};

export function formatScore(n: number): string {
  return n.toLocaleString("en-US");
}

export function loadBestScores(): BestScores {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bestScore: 0, bestStreak: 0, bestAccuracy: 0 };
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

export function saveBestScores(next: BestScores): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function mergeBests(run: RunStats, prev: BestScores): BestScores {
  return {
    bestScore: Math.max(prev.bestScore, run.score),
    bestStreak: Math.max(prev.bestStreak, run.bestStreak),
    bestAccuracy: Math.max(prev.bestAccuracy, run.accuracy),
  };
}
