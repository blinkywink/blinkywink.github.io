import type { TowerEntity } from "../../data/types";
import {
  difficultyForRound,
  type DifficultyConfig,
  ZOOMED_CONFIG,
} from "./config";
import { pickOne } from "../../utils/random";

export type Challenge = {
  round: number;
  correct: TowerEntity;
  difficulty: DifficultyConfig;
  startedAt: number;
};

function poolForSelection(entities: TowerEntity[]): {
  towers: TowerEntity[];
  upgrades: TowerEntity[];
} {
  return {
    towers: entities.filter((e) => e.type === "tower"),
    upgrades: entities.filter((e) => e.type !== "tower"),
  };
}

export function pickCorrectEntity(entities: TowerEntity[]): TowerEntity {
  const { towers, upgrades } = poolForSelection(entities);
  const roll = Math.random();
  if (roll < ZOOMED_CONFIG.towerChance && towers.length) {
    return pickOne(towers);
  }
  if (upgrades.length) return pickOne(upgrades);
  return pickOne(entities);
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
