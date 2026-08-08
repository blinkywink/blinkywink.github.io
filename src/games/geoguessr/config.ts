import { SHARED_RUN } from "../rewards";

export const GEOGUESSR_CONFIG = {
  roundsPerRun: SHARED_RUN.roundsPerRun,
  maxLives: SHARED_RUN.maxLives,
  maxAttempts: 3,
  attemptScoreMultipliers: [1, 0.55, 0.3] as [number, number, number],
};
