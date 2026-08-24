import {
  cellKey,
  isAdjacent,
  sameCell,
  type BlowColor,
  type BlowLevel,
  type BlowPair,
  type Cell,
} from "./config";

export type PathMap = Partial<Record<BlowColor, Cell[]>>;

export function endpointColor(
  level: BlowLevel,
  r: number,
  c: number,
): BlowColor | null {
  for (const p of level.pairs) {
    if (
      (p.a.r === r && p.a.c === c) ||
      (p.b.r === r && p.b.c === c)
    ) {
      return p.color;
    }
  }
  return null;
}

export function pairFor(level: BlowLevel, color: BlowColor): BlowPair | null {
  return level.pairs.find((p) => p.color === color) ?? null;
}

/** Which color currently owns a cell (path or endpoint). */
export function colorAt(
  level: BlowLevel,
  paths: PathMap,
  r: number,
  c: number,
): BlowColor | null {
  for (const p of level.pairs) {
    const path = paths[p.color];
    if (path?.some((cell) => cell.r === r && cell.c === c)) return p.color;
  }
  return endpointColor(level, r, c);
}

export function pathComplete(level: BlowLevel, paths: PathMap, color: BlowColor): boolean {
  const pair = pairFor(level, color);
  const path = paths[color];
  if (!pair || !path || path.length < 2) return false;
  const start = path[0]!;
  const end = path[path.length - 1]!;
  const endsOk =
    (sameCell(start, pair.a) && sameCell(end, pair.b)) ||
    (sameCell(start, pair.b) && sameCell(end, pair.a));
  return endsOk;
}

export function allPairsConnected(level: BlowLevel, paths: PathMap): boolean {
  return level.pairs.every((p) => pathComplete(level, paths, p.color));
}

export function filledCount(level: BlowLevel, paths: PathMap): number {
  const seen = new Set<string>();
  for (const p of level.pairs) {
    for (const cell of paths[p.color] ?? []) {
      seen.add(cellKey(cell.r, cell.c));
    }
  }
  return seen.size;
}

export function boardFilled(level: BlowLevel, paths: PathMap): boolean {
  return filledCount(level, paths) === level.size * level.size;
}

/** Classic Flow Free clear: every pair linked and every cell used. */
export function isLevelCleared(level: BlowLevel, paths: PathMap): boolean {
  return allPairsConnected(level, paths) && boardFilled(level, paths);
}

/**
 * Begin / continue a drag.
 * - Endpoint: reset that color's path to that end.
 * - Own path cell: truncate path to that cell.
 */
export function beginPath(
  level: BlowLevel,
  paths: PathMap,
  r: number,
  c: number,
): { paths: PathMap; color: BlowColor } | null {
  const onPath = colorAt(level, paths, r, c);
  const endColor = endpointColor(level, r, c);

  if (endColor) {
    const next = { ...paths, [endColor]: [{ r, c }] };
    return { paths: next, color: endColor };
  }

  if (onPath) {
    const path = paths[onPath] ?? [];
    const idx = path.findIndex((cell) => cell.r === r && cell.c === c);
    if (idx < 0) return null;
    const next = { ...paths, [onPath]: path.slice(0, idx + 1) };
    return { paths: next, color: onPath };
  }

  return null;
}

export function extendPath(
  level: BlowLevel,
  paths: PathMap,
  color: BlowColor,
  r: number,
  c: number,
): PathMap | null {
  if (r < 0 || c < 0 || r >= level.size || c >= level.size) return null;
  const path = paths[color];
  if (!path?.length) return null;
  const tip = path[path.length - 1]!;
  if (sameCell(tip, { r, c })) return paths;
  if (!isAdjacent(tip, { r, c })) return null;

  // Backtrack along own path.
  const ownIdx = path.findIndex((cell) => cell.r === r && cell.c === c);
  if (ownIdx >= 0) {
    return { ...paths, [color]: path.slice(0, ownIdx + 1) };
  }

  // Already hit the other bloon - pipe is locked (no drawing past it).
  if (pathComplete(level, paths, color)) return null;

  const occ = colorAt(level, paths, r, c);
  if (occ && occ !== color) return null;

  const end = endpointColor(level, r, c);
  if (end && end !== color) return null;

  return { ...paths, [color]: [...path, { r, c }] };
}

export function emptyPaths(): PathMap {
  return {};
}

export function connectedCount(level: BlowLevel, paths: PathMap): number {
  return level.pairs.filter((p) => pathComplete(level, paths, p.color)).length;
}
