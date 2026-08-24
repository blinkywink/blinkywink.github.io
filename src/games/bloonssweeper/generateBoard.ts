import type { SweeperDifficultyConfig } from "./config";

export type Cell = {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
};

export type Board = Cell[][];

export function emptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      adjacent: 0,
      revealed: false,
      flagged: false,
    })),
  );
}

function inBounds(board: Board, r: number, c: number): boolean {
  return r >= 0 && r < board.length && c >= 0 && c < (board[0]?.length ?? 0);
}

export function neighbors(r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      out.push([r + dr, c + dc]);
    }
  }
  return out;
}

/** Place mines after the first click so that cell (and vicinity) stay safe. */
export function placeMines(
  board: Board,
  cfg: SweeperDifficultyConfig,
  safeR: number,
  safeC: number,
): Board {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  const forbidden = new Set<string>();
  forbidden.add(`${safeR},${safeC}`);
  for (const [nr, nc] of neighbors(safeR, safeC)) {
    if (inBounds(next, nr, nc)) forbidden.add(`${nr},${nc}`);
  }

  const slots: [number, number][] = [];
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      if (!forbidden.has(`${r},${c}`)) slots.push([r, c]);
    }
  }

  // Fisher-Yates partial shuffle for mine count
  const mineCount = Math.min(cfg.mines, slots.length);
  for (let i = 0; i < mineCount; i++) {
    const j = i + Math.floor(Math.random() * (slots.length - i));
    const tmp = slots[i]!;
    slots[i] = slots[j]!;
    slots[j] = tmp;
    const [mr, mc] = slots[i]!;
    next[mr]![mc]!.mine = true;
  }

  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const cell = next[r]![c]!;
      if (cell.mine) {
        cell.adjacent = 0;
        continue;
      }
      let n = 0;
      for (const [nr, nc] of neighbors(r, c)) {
        if (inBounds(next, nr, nc) && next[nr]![nc]!.mine) n += 1;
      }
      cell.adjacent = n;
    }
  }

  return next;
}

/** Flood-reveal from a zero cell; returns copy. */
export function revealFlood(board: Board, startR: number, startC: number): Board {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  const stack: [number, number][] = [[startR, startC]];

  while (stack.length) {
    const [r, c] = stack.pop()!;
    if (!inBounds(next, r, c)) continue;
    const cell = next[r]![c]!;
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.mine || cell.adjacent > 0) continue;
    for (const [nr, nc] of neighbors(r, c)) {
      stack.push([nr, nc]);
    }
  }

  return next;
}

export function revealAllMines(board: Board): Board {
  return board.map((row) =>
    row.map((cell) => (cell.mine ? { ...cell, revealed: true } : { ...cell })),
  );
}

export function countFlags(board: Board): number {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell.flagged) n += 1;
  return n;
}

export function isWin(board: Board): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.mine && !cell.revealed) return false;
    }
  }
  return true;
}
