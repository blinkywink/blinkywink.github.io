import type { TowerEntity } from "../../data/types";
import {
  difficultyForRound,
  type DifficultyConfig,
} from "./config";
import { pickOne } from "../../utils/random";

export type Challenge = {
  round: number;
  correct: TowerEntity;
  difficulty: DifficultyConfig;
  startedAt: number;
};

function zoomedPool(entities: TowerEntity[]): TowerEntity[] {
  return entities.filter((e) => {
    if (e.type === "tower") return true;
    return e.type === "upgrade" && e.tier >= 4;
  });
}

export function pickCorrectEntity(entities: TowerEntity[]): TowerEntity {
  const pool = zoomedPool(entities);
  const bag = pool.length ? pool : entities;
  return pickOne(bag);
}

export function createChallenge(
  round: number,
  entities: TowerEntity[],
  recentIds: string[] = [],
): Challenge {
  const difficulty = difficultyForRound(round);
  let correct = pickCorrectEntity(entities);
  let attempts = 0;
  while (recentIds.includes(correct.id) && attempts < 8) {
    correct = pickCorrectEntity(entities);
    attempts++;
  }

  return {
    round,
    correct,
    difficulty,
    startedAt: performance.now(),
  };
}
