import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

export type EndlessGameId = "bananacatch" | "camodetection";

export type GameScoreNeighbor = {
  rank: number;
  userId: string;
  username: string;
  score: number;
  isYou: boolean;
};

export type GameScoreReport = {
  gameId: EndlessGameId;
  score: number;
  bestScore: number;
  isNewBest: boolean;
  rank: number | null;
  neighbors: GameScoreNeighbor[];
};

const LOCAL_KEYS: Record<EndlessGameId, string> = {
  bananacatch: "bloon-arcade:bananacatch:best-score",
  camodetection: "bloon-arcade:camodetection:best-score",
};

export function loadLocalBestScore(gameId: EndlessGameId): number {
  try {
    const raw = localStorage.getItem(LOCAL_KEYS[gameId]);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveLocalBestScore(gameId: EndlessGameId, score: number): number {
  const next = Math.max(loadLocalBestScore(gameId), Math.max(0, Math.floor(score)));
  try {
    localStorage.setItem(LOCAL_KEYS[gameId], String(next));
  } catch {
    /* ignore */
  }
  return next;
}

function normalizeReport(
  gameId: EndlessGameId,
  score: number,
  raw: unknown,
  localBest: number,
): GameScoreReport {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const neighborsRaw = Array.isArray(data.neighbors) ? data.neighbors : [];
  const neighbors: GameScoreNeighbor[] = neighborsRaw
    .map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<
        string,
        unknown
      >;
      return {
        rank: Number(r.rank) || 0,
        userId: String(r.userId ?? ""),
        username: String(r.username ?? "Player"),
        score: Number(r.score) || 0,
        isYou: Boolean(r.isYou),
      };
    })
    .filter((row) => row.rank > 0);

  const bestScore = Math.max(
    localBest,
    Number(data.bestScore) || 0,
    score,
  );
  return {
    gameId,
    score,
    bestScore,
    isNewBest: Boolean(data.isNewBest) || score > localBest,
    rank: data.rank == null ? null : Number(data.rank) || null,
    neighbors,
  };
}

/** Save a run score and return personal best + nearby ranks when signed in. */
export async function submitEndlessGameScore(
  gameId: EndlessGameId,
  score: number,
): Promise<GameScoreReport> {
  const scored = Math.max(0, Math.floor(score));
  const prevLocal = loadLocalBestScore(gameId);
  const localBest = saveLocalBestScore(gameId, scored);
  const isNewLocal = scored > prevLocal;

  const signedIn = Boolean(getAccessToken() && loadAppSession());
  if (!signedIn) {
    return {
      gameId,
      score: scored,
      bestScore: localBest,
      isNewBest: isNewLocal,
      rank: null,
      neighbors: [],
    };
  }

  try {
    const { data, error } = await supabase.rpc("submit_game_score", {
      p_game_id: gameId,
      p_score: scored,
    });
    if (error) throw new Error(error.message);
    return normalizeReport(gameId, scored, data, prevLocal);
  } catch (err) {
    console.warn(
      "submit_game_score failed",
      err instanceof Error ? err.message : err,
    );
    return {
      gameId,
      score: scored,
      bestScore: localBest,
      isNewBest: isNewLocal,
      rank: null,
      neighbors: [],
    };
  }
}

export function scoreLabel(gameId: EndlessGameId): string {
  return gameId === "bananacatch" ? "Bananas" : "Rounds";
}
