import {
  BLOW_COLORS,
  BLOW_DAILY_PAIRS,
  BLOW_DAILY_SIZE,
  BLOW_PRACTICE_PAIRS,
  BLOW_PRACTICE_SIZE,
  hashDay,
  type BlowColor,
  type BlowLevel,
  type Cell,
} from "./config";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rnd: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

/**
 * Seeded serpentine cover with flip/transpose so dailies aren't identical shapes.
 */
function hamiltonianPath(size: number, rnd: () => number): Cell[] {
  const cells: Cell[] = [];
  const flipRows = rnd() < 0.5;
  const transpose = rnd() < 0.5;
  for (let r = 0; r < size; r++) {
    const row = flipRows ? size - 1 - r : r;
    const leftToRight = r % 2 === 0;
    for (let i = 0; i < size; i++) {
      const c = leftToRight ? i : size - 1 - i;
      cells.push(transpose ? { r: c, c: row } : { r: row, c });
    }
  }
  return cells;
}

/**
 * Split into long winding pipes. Rejects straight-ish segments so short
 * "connect the dots" clears aren't a valid fill.
 */
function splitPath(
  path: Cell[],
  pairCount: number,
  rnd: () => number,
  size: number,
): Cell[][] {
  const n = path.length;
  // Long pipes force routing around other colors.
  const minLen = Math.max(5, Math.floor(size * 0.75));
  if (n < pairCount * minLen) return [];

  const segments: Cell[][] = [];
  let remaining = n;
  let left = pairCount;
  let start = 0;
  for (let i = 0; i < pairCount - 1; i++) {
    left -= 1;
    const maxLen = remaining - left * minLen;
    const bias = rnd();
    // Prefer uneven lengths — some colors snake across half the board.
    const len =
      minLen + Math.floor((bias * bias * 0.85 + rnd() * 0.15) * (maxLen - minLen + 1));
    segments.push(path.slice(start, start + len));
    start += len;
    remaining -= len;
  }
  segments.push(path.slice(start));

  // Every segment should detour (path longer than Manhattan).
  const windy = segments.every((seg) => {
    if (seg.length < 2) return false;
    const detour = seg.length - 1 - manhattan(seg[0]!, seg[seg.length - 1]!);
    return detour >= Math.max(2, Math.floor(size / 3));
  });
  return windy ? segments : [];
}

export function generateBlowLevel(
  size: number,
  pairCount: number,
  seed: number,
): BlowLevel {
  const rnd = mulberry32(seed >>> 0);
  const path = hamiltonianPath(size, rnd);
  let segments: Cell[][] = [];
  let guard = 0;
  while (segments.length !== pairCount && guard++ < 80) {
    segments = splitPath(path, pairCount, rnd, size);
  }
  if (segments.length !== pairCount) {
    // Fallback: even-ish long chops (still longer than a straight line).
    segments = [];
    const base = Math.floor(path.length / pairCount);
    let i = 0;
    for (let p = 0; p < pairCount; p++) {
      const len = p === pairCount - 1 ? path.length - i : Math.max(base, size);
      segments.push(path.slice(i, i + len));
      i += len;
    }
  }

  const colors = [...BLOW_COLORS.slice(0, pairCount)];
  shuffleInPlace(colors, rnd);

  const pairs = segments.map((seg, i) => {
    const flip = rnd() < 0.5;
    return {
      color: colors[i] as BlowColor,
      a: flip ? seg[seg.length - 1]! : seg[0]!,
      b: flip ? seg[0]! : seg[seg.length - 1]!,
    };
  });

  return {
    id: `blow-${size}x${size}-p${pairCount}-s${seed >>> 0}`,
    size,
    pairs,
  };
}

export function dailyLevel(dayKey: string): BlowLevel {
  // v2 — harder, longer pipes (invalidates easy v1 boards).
  const seed = hashDay(`blowfree-daily-v2-${dayKey}`);
  return generateBlowLevel(BLOW_DAILY_SIZE, BLOW_DAILY_PAIRS, seed);
}

export function practiceLevel(extraSalt = Date.now()): BlowLevel {
  const seed = (hashDay(`blowfree-practice-v2-${extraSalt}`) ^ extraSalt) >>> 0;
  return generateBlowLevel(BLOW_PRACTICE_SIZE, BLOW_PRACTICE_PAIRS, seed);
}
