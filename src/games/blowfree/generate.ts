import {
  BLOW_COLORS,
  BLOW_DAILY_PAIRS,
  BLOW_DAILY_SIZE,
  BLOW_PRACTICE_PAIRS,
  BLOW_PRACTICE_SIZE,
  cellKey,
  hashDay,
  sameCell,
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

const DIRS: Cell[] = [
  { r: 0, c: 1 },
  { r: 0, c: -1 },
  { r: 1, c: 0 },
  { r: -1, c: 0 },
];

type DraftPair = { a: Cell; b: Cell };

function shortestPath(
  size: number,
  start: Cell,
  end: Cell,
  blocked: Set<string>,
): Cell[] | null {
  const startK = cellKey(start.r, start.c);
  const endK = cellKey(end.r, end.c);
  if (blocked.has(startK) || blocked.has(endK)) return null;
  if (sameCell(start, end)) return [start];

  const prev = new Map<string, string>();
  const q: Cell[] = [start];
  prev.set(startK, startK);

  while (q.length) {
    const cur = q.shift()!;
    const curK = cellKey(cur.r, cur.c);
    if (curK === endK) {
      const path: Cell[] = [];
      let k: string | undefined = endK;
      while (k && k !== startK) {
        const [r, c] = k.split(",").map(Number);
        path.unshift({ r: r!, c: c! });
        k = prev.get(k);
      }
      path.unshift(start);
      return path;
    }
    for (const d of DIRS) {
      const nr = cur.r + d.r;
      const nc = cur.c + d.c;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const k = cellKey(nr, nc);
      if (blocked.has(k) || prev.has(k)) continue;
      prev.set(k, curK);
      q.push({ r: nr, c: nc });
    }
  }
  return null;
}

function endpointBlockers(pairs: DraftPair[], exceptIndex: number): Set<string> {
  const blocked = new Set<string>();
  pairs.forEach((p, i) => {
    if (i === exceptIndex) return;
    blocked.add(cellKey(p.a.r, p.a.c));
    blocked.add(cellKey(p.b.r, p.b.c));
  });
  return blocked;
}

/** Inward spiral — breaks row/column stripe layouts. */
function spiralPath(size: number): Cell[] {
  const cells: Cell[] = [];
  let top = 0;
  let bottom = size - 1;
  let left = 0;
  let right = size - 1;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) cells.push({ r: top, c });
    top++;
    for (let r = top; r <= bottom; r++) cells.push({ r, c: right });
    right--;
    if (top <= bottom) {
      for (let c = right; c >= left; c--) cells.push({ r: bottom, c });
      bottom--;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r--) cells.push({ r, c: left });
      left++;
    }
  }
  return cells;
}

function rowSerpentine(size: number, rnd: () => number): Cell[] {
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

function columnSerpentine(size: number, rnd: () => number): Cell[] {
  const cells: Cell[] = [];
  const flipCols = rnd() < 0.5;
  for (let c = 0; c < size; c++) {
    const col = flipCols ? size - 1 - c : c;
    const topDown = c % 2 === 0;
    for (let i = 0; i < size; i++) {
      const r = topDown ? i : size - 1 - i;
      cells.push({ r, c: col });
    }
  }
  return cells;
}

function pickCoverPath(size: number, rnd: () => number): Cell[] {
  const roll = rnd();
  if (roll < 0.4) return spiralPath(size);
  if (roll < 0.75) return rowSerpentine(size, rnd);
  return columnSerpentine(size, rnd);
}

/**
 * Split a Hamiltonian cover into long winding pipes.
 * Each segment must detour (Flow Free: canonical paths aren't shorten-able).
 */
function splitPath(
  path: Cell[],
  pairCount: number,
  rnd: () => number,
  size: number,
): Cell[][] {
  const n = path.length;
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
    const len =
      minLen +
      Math.floor((bias * bias * 0.85 + rnd() * 0.15) * (maxLen - minLen + 1));
    segments.push(path.slice(start, start + len));
    start += len;
    remaining -= len;
  }
  segments.push(path.slice(start));

  const minDetour = Math.max(2, Math.floor(size / 3));
  const windy = segments.every((seg) => {
    if (seg.length < 2) return false;
    const detour = seg.length - 1 - manhattan(seg[0]!, seg[seg.length - 1]!);
    return detour >= minDetour;
  });
  return windy ? segments : [];
}

/** Reject if naive shortest-path fill works in any order. */
function greedyShortcutFill(
  size: number,
  pairs: DraftPair[],
  rnd: () => number,
): boolean {
  for (let trial = 0; trial < 12; trial++) {
    const order = pairs.map((_, i) => i);
    shuffleInPlace(order, rnd);

    const owned = new Set<string>();
    for (const p of pairs) {
      owned.add(cellKey(p.a.r, p.a.c));
      owned.add(cellKey(p.b.r, p.b.c));
    }

    let ok = true;
    for (const i of order) {
      const p = pairs[i]!;
      const blocked = endpointBlockers(pairs, i);
      for (const k of owned) {
        if (k === cellKey(p.a.r, p.a.c) || k === cellKey(p.b.r, p.b.c)) {
          continue;
        }
        blocked.add(k);
      }
      const path = shortestPath(size, p.a, p.b, blocked);
      if (!path) {
        ok = false;
        break;
      }
      for (const c of path) owned.add(cellKey(c.r, c.c));
    }
    if (ok && owned.size === size * size) return true;
  }
  return false;
}

function longStripeCount(pairs: DraftPair[], size: number): number {
  let count = 0;
  for (const p of pairs) {
    const span = manhattan(p.a, p.b);
    if ((p.a.r === p.b.r || p.a.c === p.b.c) && span >= size - 2) count++;
  }
  return count;
}

type DifficultyScore = {
  avgDetour: number;
  minDetour: number;
  avgGap: number;
  maxGap: number;
  blockers: number;
  rank: number;
};

function scoreDifficulty(
  size: number,
  pairs: DraftPair[],
  segments: Cell[][],
): DifficultyScore | null {
  let detourSum = 0;
  let minDetour = Infinity;
  let gapSum = 0;
  let maxGap = 0;
  let blockers = 0;

  for (let i = 0; i < pairs.length; i++) {
    const seg = segments[i]!;
    const p = pairs[i]!;
    const detour = seg.length - 1 - manhattan(p.a, p.b);
    detourSum += detour;
    minDetour = Math.min(minDetour, detour);

    const cheat = shortestPath(
      size,
      p.a,
      p.b,
      endpointBlockers(pairs, i),
    );
    if (!cheat) return null;
    const gap = seg.length - cheat.length;
    gapSum += gap;
    maxGap = Math.max(maxGap, gap);

    const cheatOcc = new Set(cheat.map((c) => cellKey(c.r, c.c)));
    for (let j = 0; j < pairs.length; j++) {
      if (j === i) continue;
      const blocked = endpointBlockers(pairs, j);
      for (const k of cheatOcc) {
        const q = pairs[j]!;
        const isEnd =
          k === cellKey(q.a.r, q.a.c) || k === cellKey(q.b.r, q.b.c);
        if (!isEnd) blocked.add(k);
      }
      if (!shortestPath(size, pairs[j]!.a, pairs[j]!.b, blocked)) {
        blockers++;
        break;
      }
    }
  }

  const avgDetour = detourSum / pairs.length;
  const avgGap = gapSum / pairs.length;
  const rank =
    avgDetour * 4 +
    minDetour * 3 +
    avgGap * 2 +
    maxGap +
    blockers * 5;

  return { avgDetour, minDetour, avgGap, maxGap, blockers, rank };
}

function isGoodDifficulty(score: DifficultyScore, size: number): boolean {
  const minAvgDetour = size >= 9 ? 2.5 : 2;
  const minAvgGap = size >= 9 ? 3 : 2.5;
  const minMaxGap = size >= 9 ? 4 : 3;

  return (
    score.avgDetour >= minAvgDetour &&
    score.minDetour >= 2 &&
    score.avgGap >= minAvgGap &&
    score.maxGap >= minMaxGap
  );
}

function buildLevelFromSegments(
  size: number,
  pairCount: number,
  seed: number,
  segments: Cell[][],
): BlowLevel {
  const rnd = mulberry32(seed >>> 0);
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

export function generateBlowLevel(
  size: number,
  pairCount: number,
  seed: number,
): BlowLevel {
  let best: { level: BlowLevel; score: DifficultyScore } | null = null;

  for (let attempt = 0; attempt < 8_000; attempt++) {
    const attemptSeed = (seed + attempt * 9973) >>> 0;
    const rnd = mulberry32(attemptSeed);
    const path = pickCoverPath(size, rnd);

    for (let guard = 0; guard < 48; guard++) {
      const segments = splitPath(path, pairCount, rnd, size);
      if (segments.length !== pairCount) continue;

      const draftPairs = segments.map((seg) => ({
        a: seg[0]!,
        b: seg[seg.length - 1]!,
      }));

      if (greedyShortcutFill(size, draftPairs, rnd)) continue;
      if (longStripeCount(draftPairs, size) >= 2) continue;

      const score = scoreDifficulty(size, draftPairs, segments);
      if (!score) continue;

      if (isGoodDifficulty(score, size)) {
        return buildLevelFromSegments(size, pairCount, attemptSeed, segments);
      }

      if (
        score.avgDetour >= 2 &&
        score.avgGap >= 2.5 &&
        (!best || score.rank > best.score.rank)
      ) {
        best = {
          level: buildLevelFromSegments(size, pairCount, attemptSeed, segments),
          score,
        };
      }
    }
  }

  if (best) return best.level;

  throw new Error(
    `Failed to generate Blow Free level ${size}x${size} p${pairCount} seed ${seed}`,
  );
}

export function dailyLevel(dayKey: string): BlowLevel {
  const seed = hashDay(`blowfree-daily-v6-${dayKey}`);
  return generateBlowLevel(BLOW_DAILY_SIZE, BLOW_DAILY_PAIRS, seed);
}

export function practiceLevel(extraSalt = Date.now()): BlowLevel {
  const seed = (hashDay(`blowfree-practice-v6-${extraSalt}`) ^ extraSalt) >>> 0;
  return generateBlowLevel(BLOW_PRACTICE_SIZE, BLOW_PRACTICE_PAIRS, seed);
}
