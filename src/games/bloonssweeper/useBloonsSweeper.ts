import { useCallback, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import {
  SWEEPER_DEFAULT_DIFFICULTY,
  SWEEPER_DIFFICULTIES,
  type SweeperDifficulty,
  type SweeperDifficultyConfig,
} from "./config";
import {
  countFlags,
  emptyBoard,
  isWin,
  placeMines,
  revealAllMines,
  revealFlood,
  type Board,
} from "./generateBoard";

export type SweeperStatus = "ready" | "playing" | "won" | "lost";

export type SweeperState = {
  difficulty: SweeperDifficulty;
  cfg: SweeperDifficultyConfig;
  board: Board;
  status: SweeperStatus;
  minesPlaced: boolean;
  reward: number;
  awarded: boolean;
  startedAt: number | null;
  finishedAt: number | null;
};

function fresh(difficulty: SweeperDifficulty): SweeperState {
  const cfg = SWEEPER_DIFFICULTIES[difficulty];
  return {
    difficulty,
    cfg,
    board: emptyBoard(cfg.rows, cfg.cols),
    status: "ready",
    minesPlaced: false,
    reward: 0,
    awarded: false,
    startedAt: null,
    finishedAt: null,
  };
}

export function useBloonsSweeper() {
  const { setCoinBalance } = useAuth();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;

  const [state, setState] = useState<SweeperState>(() =>
    fresh(SWEEPER_DEFAULT_DIFFICULTY),
  );

  const setDifficulty = useCallback((difficulty: SweeperDifficulty) => {
    setState(fresh(difficulty));
  }, []);

  const restart = useCallback(() => {
    setState((s) => fresh(s.difficulty));
  }, []);

  const awardWin = useCallback(async (reward: number) => {
    if (reward <= 0) return;
    const balance = await awardCoins(reward);
    if (balance != null) setCoinBalanceRef.current(balance);
  }, []);

  const reveal = useCallback(
    (r: number, c: number) => {
      setState((s) => {
        if (s.status === "won" || s.status === "lost") return s;
        const cell = s.board[r]?.[c];
        if (!cell || cell.revealed || cell.flagged) return s;

        let board = s.board;
        let minesPlaced = s.minesPlaced;
        let startedAt = s.startedAt;
        if (!minesPlaced) {
          board = placeMines(board, s.cfg, r, c);
          minesPlaced = true;
          startedAt = Date.now();
        }

        const target = board[r]![c]!;
        if (target.mine) {
          board = revealAllMines(board);
          return {
            ...s,
            board,
            minesPlaced,
            startedAt,
            status: "lost",
            finishedAt: Date.now(),
          };
        }

        board = revealFlood(board, r, c);
        if (isWin(board)) {
          const reward = s.cfg.winReward;
          const difficulty = s.difficulty;
          queueMicrotask(() => {
            void awardWin(reward).then(() => {
              setState((cur) => {
                if (cur.difficulty !== difficulty || cur.status !== "won") {
                  return cur;
                }
                return { ...cur, awarded: true, reward };
              });
            });
          });
          return {
            ...s,
            board,
            minesPlaced,
            startedAt,
            status: "won",
            finishedAt: Date.now(),
            reward,
            awarded: false,
          };
        }

        return {
          ...s,
          board,
          minesPlaced,
          startedAt,
          status: "playing",
        };
      });
    },
    [awardWin],
  );

  const toggleFlag = useCallback((r: number, c: number) => {
    setState((s) => {
      if (s.status === "won" || s.status === "lost") return s;
      const cell = s.board[r]?.[c];
      if (!cell || cell.revealed) return s;
      const board = s.board.map((row, ri) =>
        row.map((cel, ci) =>
          ri === r && ci === c ? { ...cel, flagged: !cel.flagged } : cel,
        ),
      );
      return {
        ...s,
        board,
        status: s.status === "ready" ? "playing" : s.status,
        startedAt: s.startedAt ?? Date.now(),
      };
    });
  }, []);

  const flags = countFlags(state.board);
  const minesLeft = Math.max(0, state.cfg.mines - flags);

  return {
    state,
    minesLeft,
    setDifficulty,
    restart,
    reveal,
    toggleFlag,
  };
}
