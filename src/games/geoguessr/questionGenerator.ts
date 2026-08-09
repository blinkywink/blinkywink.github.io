import type { MapEntity } from "../../data/types";
import { difficultyForRound, type DifficultyConfig } from "../zoomed/config";
import { pickOne } from "../../utils/random";

export type MapChallenge = {
  round: number;
  correct: MapEntity;
  difficulty: DifficultyConfig;
  startedAt: number;
};

export function createMapChallenge(
  round: number,
  pool: MapEntity[],
  recentIds: string[] = [],
): MapChallenge {
  const difficulty = difficultyForRound(round);
  let correct = pickOne(pool);
  let attempts = 0;
  while (recentIds.includes(correct.id) && attempts < 10 && pool.length > 1) {
    correct = pickOne(pool);
    attempts++;
  }

  return {
    round,
    correct,
    difficulty,
    startedAt: performance.now(),
  };
}
