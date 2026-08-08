import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { spendCoins } from "../../lib/spendCoins";
import { SHARED_RUN } from "../rewards";
import { PRICE_CHECK_CONFIG, pointsForCorrect } from "./config";
import { createPriceRound, type PriceRound } from "./generateRound";
import {
  loadBestScores,
  mergeBests,
  saveBestScores,
  type BestScores,
  type RunStats,
} from "./scoring";

export type Guess = "left" | "right";

export type Feedback = {
  guess: Guess;
  correct: boolean;
  leftTotal: number;
  rightTotal: number;
  points: number;
};

type Phase = "playing" | "reveal" | "results";

type State = {
  phase: Phase;
  round: PriceRound;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  answered: number;
  lives: number;
  freePlay: boolean;
  feedback: Feedback | null;
  lastRun: RunStats | null;
  bests: BestScores;
  resumeRound: number | null;
  clearedRun: boolean;
  continueError: string | null;
  continueBusy: boolean;
};

function freshRound(n: number): PriceRound {
  return createPriceRound(n);
}

function initialState(): State {
  return {
    phase: "playing",
    round: freshRound(1),
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    lives: PRICE_CHECK_CONFIG.maxLives,
    freePlay: false,
    feedback: null,
    lastRun: null,
    bests: loadBestScores(),
    resumeRound: null,
    clearedRun: false,
    continueError: null,
    continueBusy: false,
  };
}

function toRunStats(s: State): RunStats {
  const total = s.answered;
  return {
    score: s.score,
    correct: s.correct,
    total,
    accuracy: total > 0 ? Math.round((s.correct / total) * 100) : 0,
    bestStreak: s.bestStreak,
  };
}

function finishRun(
  s: State,
  opts: { resumeRound: number; cleared: boolean },
): State {
  const run = toRunStats(s);
  const bests = mergeBests(run, s.bests);
  saveBestScores(bests);
  return {
    ...s,
    phase: "results",
    lastRun: run,
    bests,
    feedback: null,
    resumeRound: opts.resumeRound,
    clearedRun: opts.cleared,
    continueError: null,
    continueBusy: false,
  };
}

export function usePriceCheck() {
  const { profile, setCoinBalance } = useAuth();
  const [state, setState] = useState<State>(initialState);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const guess = useCallback((side: Guess) => {
    setState((s) => {
      if (s.phase !== "playing") return s;
      const ok = side === s.round.answer;
      const streak = ok ? s.streak + 1 : 0;
      const bestStreak = Math.max(s.bestStreak, streak);
      const points = ok ? pointsForCorrect(s.round.round, streak) : 0;
      const lives = ok ? s.lives : s.lives - 1;
      const feedback: Feedback = {
        guess: side,
        correct: ok,
        leftTotal: s.round.left.total,
        rightTotal: s.round.right.total,
        points,
      };

      if (ok && points > 0) {
        void awardCoins(points).then((balance) => {
          if (balance != null) setCoinBalanceRef.current(balance);
        });
      }

      return {
        ...s,
        phase: "reveal",
        streak,
        bestStreak,
        score: s.score + points,
        correct: s.correct + (ok ? 1 : 0),
        answered: s.answered + 1,
        lives,
        feedback,
      };
    });
  }, []);

  const goNext = useCallback(() => {
    setState((s) => {
      if (s.phase !== "reveal") return s;
      if (s.lives <= 0) {
        return finishRun(s, {
          resumeRound: s.round.round + 1,
          cleared: false,
        });
      }

      if (!s.freePlay && s.round.round >= PRICE_CHECK_CONFIG.roundsPerRun) {
        return finishRun(s, {
          resumeRound: s.round.round + 1,
          cleared: true,
        });
      }

      return {
        ...s,
        phase: "playing",
        round: freshRound(s.round.round + 1),
        feedback: null,
      };
    });
  }, []);

  const buyContinue = useCallback(async () => {
    let allowed = false;
    setState((s) => {
      if (s.phase !== "results" || s.continueBusy || s.resumeRound == null) {
        return s;
      }
      allowed = true;
      return { ...s, continueBusy: true, continueError: null };
    });
    if (!allowed) return;

    const balance = await spendCoins(SHARED_RUN.continueCost);
    if (balance == null) {
      setState((s) => ({
        ...s,
        continueBusy: false,
        continueError:
          (profileRef.current?.coins ?? 0) < SHARED_RUN.continueCost
            ? "Not enough Cash."
            : "Purchase failed — try again.",
      }));
      return;
    }
    setCoinBalanceRef.current(balance);

    setState((s) => {
      const resumeRound = s.resumeRound ?? s.round.round + 1;
      return {
        ...s,
        phase: "playing",
        freePlay: true,
        lives: PRICE_CHECK_CONFIG.maxLives,
        round: freshRound(resumeRound),
        feedback: null,
        resumeRound: null,
        clearedRun: false,
        continueBusy: false,
        continueError: null,
        lastRun: null,
      };
    });
  }, []);

  const playAgain = useCallback(() => {
    setState(initialState());
  }, []);

  const roundsPerRun = PRICE_CHECK_CONFIG.roundsPerRun;
  const maxLives = PRICE_CHECK_CONFIG.maxLives;

  return useMemo(
    () => ({
      state,
      guess,
      goNext,
      playAgain,
      buyContinue,
      continueCost: SHARED_RUN.continueCost,
      roundsPerRun,
      maxLives,
    }),
    [
      state,
      guess,
      goNext,
      playAgain,
      buyContinue,
      roundsPerRun,
      maxLives,
    ],
  );
}
