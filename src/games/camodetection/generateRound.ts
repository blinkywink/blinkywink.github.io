import {
  camoCountForRound,
  flashMsForRound,
  gridSizeForRound,
} from "./config";

export type CamoRound = {
  round: number;
  /** Edge length of the N×N grid. */
  grid: number;
  /** Cell indices (row-major) that flashed camo. */
  camo: number[];
  flashMs: number;
};

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function shufflePick(count: number, from: number): number[] {
  const pool = Array.from({ length: from }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

export function createCamoRound(round: number): CamoRound {
  const grid = gridSizeForRound(round);
  const cells = grid * grid;
  const count = camoCountForRound(round, grid);
  return {
    round,
    grid,
    camo: shufflePick(count, cells),
    flashMs: flashMsForRound(round),
  };
}
