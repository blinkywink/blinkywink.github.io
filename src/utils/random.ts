/** Inclusive random float in [min, max]. */
export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Inclusive random integer in [min, max]. */
export function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

export function pickOne<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error("Cannot pick from empty list");
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sampleUnique<T>(items: readonly T[], count: number): T[] {
  if (count >= items.length) return shuffle(items);
  const arr = shuffle(items);
  return arr.slice(0, count);
}

/** Biased random in [0,1] pulling toward 0.5 when bias ∈ (0,1]. */
export function biasedUnit(bias: number): number {
  if (bias <= 0) return Math.random();
  const a = 1 + bias * 4;
  // Beta-like via two powers of random
  const u = Math.pow(Math.random(), 1 / a);
  const v = Math.pow(Math.random(), 1 / a);
  return u / (u + v);
}
