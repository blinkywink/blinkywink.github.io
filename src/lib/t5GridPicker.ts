import { allCardSpecs } from "./cardCatalog";
import { maxPathTier, type MonkeyCardSpec } from "./pathCombos";

export const T5_GRID_COLS = 6;
export const T5_GRID_ROWS = 4;
export const T5_GRID_COUNT = T5_GRID_COLS * T5_GRID_ROWS;

/** Stable shuffle so export is reproducible unless seed changes. */
export function seededShuffle<T>(items: T[], seed = 42): T[] {
  const next = items.slice();
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

/** One card per unique T5 upgrade portrait. */
export function pickT5GridCards(seed = 42): MonkeyCardSpec[] {
  const unique = new Map<string, MonkeyCardSpec>();
  for (const card of allCardSpecs()) {
    if (card.isParagon || maxPathTier(card.pathLevels) !== 5) continue;
    if (!unique.has(card.entity.id)) unique.set(card.entity.id, card);
  }
  const pool = seededShuffle([...unique.values()], seed);
  if (pool.length < T5_GRID_COUNT) {
    throw new Error(`Need ${T5_GRID_COUNT} unique T5 portraits, found ${pool.length}`);
  }
  return pool.slice(0, T5_GRID_COUNT);
}
