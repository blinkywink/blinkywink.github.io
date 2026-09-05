import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { useQuizHeroFx } from "../../lib/quizHeroFx";
import { createInstantPlayGuard } from "../../lib/instantPlayGuard";
import { useGameFarm } from "../../components/GameFarmGate";
import {
  pickRandomRound,
  resolveBloonSrc,
  type RoundDef,
} from "./rounds";
import { roundCheckPuzzleReward } from "../rewards";

export const ROUND_CHECK_MAX_GUESSES = 4;
export const ROUND_CHECK_SOLVES_TO_CLEAR = 4;
export const ROUND_CHECK_MAX_LIVES = 3;
export const ROUND_MIN = 1;
export const ROUND_MAX = 100;

export type RoundGuess = {
  value: number;
  hint: "higher" | "lower" | "correct";
};

export type PuzzleOutcome = "solved" | "missed";

export type RoundCheckStatus =
  | "playing"
  | "puzzle_done"
  | "won"
  | "lost";

export type RoundCheckState = {
  round: RoundDef;
  guesses: RoundGuess[];
  status: RoundCheckStatus;
  /** Cash banked this run (sum of puzzle payouts). */
  reward: number;
  /** Last puzzle's payout (for interstitial). */
  lastPuzzleReward: number;
  lastOutcome: PuzzleOutcome | null;
  solves: number;
  lives: number;
  recent: number[];
  /** True if every solve so far was a first-try hit. */
  perfectSoFar: boolean;
};

/** Remaining possible rounds after higher/lower feedback. */
export function rangeFromGuesses(guesses: RoundGuess[]): {
  lo: number;
  hi: number;
} {
  let lo = ROUND_MIN;
  let hi = ROUND_MAX;
  for (const g of guesses) {
    if (g.hint === "higher") lo = Math.max(lo, g.value + 1);
    else if (g.hint === "lower") hi = Math.min(hi, g.value - 1);
    else if (g.hint === "correct") {
      lo = g.value;
      hi = g.value;
    }
  }
  if (lo > hi) return { lo: hi, hi: lo };
  return { lo, hi };
}

function startPuzzle(
  recent: number[],
  extras: Partial<RoundCheckState> = {},
): RoundCheckState {
  return {
    round: pickRandomRound(recent.slice(-12)),
    guesses: [],
    status: "playing",
    reward: 0,
    lastPuzzleReward: 0,
    lastOutcome: null,
    solves: 0,
    lives: ROUND_CHECK_MAX_LIVES,
    recent,
    perfectSoFar: true,
    ...extras,
  };
}

function makeRun(recent: number[] = []): RoundCheckState {
  return startPuzzle(recent);
}

function payoutFor(
  guesses: RoundGuess[],
  answer: number,
  solved: boolean,
): number {
  const distance = solved
    ? 0
    : Math.min(...guesses.map((g) => Math.abs(g.value - answer)));
  return roundCheckPuzzleReward({
    guessCount: guesses.length,
    distance,
    solved,
  });
}

export function useRoundCheck() {
  const { setCoinBalance } = useAuth();
  const farm = useGameFarm();
  const { onCorrectCash } = useQuizHeroFx();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const onCorrectCashRef = useRef(onCorrectCash);
  onCorrectCashRef.current = onCorrectCash;
  const canPayRef = useRef(true);
  canPayRef.current = farm?.canPay !== false;
  const farmRef = useRef(farm);
  farmRef.current = farm;
  const guard = useRef(
    createInstantPlayGuard({
      instantLimit: 3,
      nextLimit: 3,
      awardGapMs: 4000,
      awardLimit: 3,
    }),
  );
  const puzzleShownAt = useRef(
    typeof performance !== "undefined" ? performance.now() : 0,
  );
  const puzzleDoneAt = useRef(0);

  const [state, setState] = useState<RoundCheckState>(() => makeRun());

  const remaining = ROUND_CHECK_MAX_GUESSES - state.guesses.length;
  const lastHint = state.guesses[state.guesses.length - 1]?.hint ?? null;
  const range = useMemo(
    () => rangeFromGuesses(state.guesses),
    [state.guesses],
  );

  const tripSpam = useCallback(() => {
    canPayRef.current = false;
    farmRef.current?.reportInstantSpam();
  }, []);

  const award = useCallback(
    (amount: number) => {
      if (amount <= 0 || !canPayRef.current) return;
      if (guard.current.markAward()) {
        tripSpam();
        return;
      }
      void (async () => {
        const balance = await awardCoins(amount, "roundcheck");
        if (balance != null) setCoinBalanceRef.current(balance);
        if (!canPayRef.current) return;
        void onCorrectCashRef.current(setCoinBalanceRef.current, {
          gameId: "roundcheck",
        });
      })();
    },
    [tripSpam],
  );

  const submit = useCallback(
    (raw: number) => {
      setState((s) => {
        if (s.status !== "playing") return s;
        const value = Math.round(raw);
        if (!Number.isFinite(value) || value < ROUND_MIN || value > ROUND_MAX) {
          return s;
        }
        if (s.guesses.some((g) => g.value === value)) return s;

        const { lo, hi } = rangeFromGuesses(s.guesses);
        if (value < lo || value > hi) return s;

        const answer = s.round.round;
        const hint: RoundGuess["hint"] =
          value === answer ? "correct" : value < answer ? "higher" : "lower";
        const guesses = [...s.guesses, { value, hint }];

        if (hint === "correct") {
          const instant =
            typeof performance !== "undefined" &&
            performance.now() - puzzleShownAt.current < 3500;
          if (guard.current.markAction(instant)) tripSpam();
          puzzleDoneAt.current =
            typeof performance !== "undefined" ? performance.now() : 0;
          const piece = canPayRef.current ? payoutFor(guesses, answer, true) : 0;
          award(piece);
          const solves = s.solves + 1;
          const perfectSoFar = s.perfectSoFar && guesses.length === 1;
          const cleared = solves >= ROUND_CHECK_SOLVES_TO_CLEAR;
          return {
            ...s,
            guesses,
            status: cleared ? "won" : "puzzle_done",
            lastOutcome: "solved",
            lastPuzzleReward: piece,
            reward: s.reward + piece,
            solves,
            perfectSoFar,
            recent: [...s.recent, answer].slice(-20),
          };
        }

        if (guesses.length >= ROUND_CHECK_MAX_GUESSES) {
          const instant =
            typeof performance !== "undefined" &&
            performance.now() - puzzleShownAt.current < 3500;
          if (guard.current.markAction(instant)) tripSpam();
          puzzleDoneAt.current =
            typeof performance !== "undefined" ? performance.now() : 0;
          const piece = canPayRef.current
            ? payoutFor(guesses, answer, false)
            : 0;
          award(piece);
          const lives = s.lives - 1;
          const dead = lives <= 0;
          return {
            ...s,
            guesses,
            status: dead ? "lost" : "puzzle_done",
            lastOutcome: "missed",
            lastPuzzleReward: piece,
            reward: s.reward + piece,
            lives,
            perfectSoFar: false,
            recent: [...s.recent, answer].slice(-20),
          };
        }

        return { ...s, guesses };
      });
    },
    [award, tripSpam],
  );

  const continueRun = useCallback(() => {
    setState((s) => {
      if (s.status !== "puzzle_done") return s;
      const instantNext =
        typeof performance !== "undefined" &&
        performance.now() - puzzleDoneAt.current < 800;
      if (guard.current.markNext(instantNext)) tripSpam();
      puzzleShownAt.current =
        typeof performance !== "undefined" ? performance.now() : 0;
      return startPuzzle(s.recent, {
        reward: s.reward,
        solves: s.solves,
        lives: s.lives,
        perfectSoFar: s.perfectSoFar,
        recent: s.recent,
      });
    });
  }, [tripSpam]);

  const playAgain = useCallback(() => {
    guard.current.reset();
    puzzleShownAt.current =
      typeof performance !== "undefined" ? performance.now() : 0;
    setState((s) => makeRun(s.recent));
  }, []);

  const srcFor = useMemo(
    () => (spawn: (typeof state.round.spawns)[number]) => resolveBloonSrc(spawn),
    [state.round],
  );

  return {
    state,
    remaining,
    lastHint,
    range,
    maxGuesses: ROUND_CHECK_MAX_GUESSES,
    solvesToClear: ROUND_CHECK_SOLVES_TO_CLEAR,
    maxLives: ROUND_CHECK_MAX_LIVES,
    submit,
    continueRun,
    playAgain,
    srcFor,
  };
}
