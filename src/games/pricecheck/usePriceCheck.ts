import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  timedOut?: boolean;
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
  timeLeftMs: number;
};

function freshRound(n: number): PriceRound {
  return createPriceRound(n);
}

function timerMs(): number {
  return PRICE_CHECK_CONFIG.timerSeconds * 1000;
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
    timeLeftMs: timerMs(),
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
    timeLeftMs: 0,
  };
}

export function usePriceCheck() {
  const { profile, setCoinBalance } = useAuth();
  const [state, setState] = useState<State>(initialState);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const settling = useRef(false);

  const settle = useCallback((side: Guess, timedOut: boolean) => {
    setState((s) => {
      if (s.phase !== "playing" || settling.current) return s;
      settling.current = true;
      const ok = !timedOut && side === s.round.answer;
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
        timedOut: timedOut || undefined,
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
        timeLeftMs: 0,
      };
    });
  }, []);

  const guess = useCallback(
    (side: Guess) => {
      settle(side, false);
    },
    [settle],
  );

  // Countdown while playing
  useEffect(() => {
    if (state.phase !== "playing") return;
    settling.current = false;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setState((s) => {
        if (s.phase !== "playing") return s;
        const next = Math.max(0, s.timeLeftMs - dt);
        if (next <= 0 && s.timeLeftMs > 0) {
          const wrong: Guess = s.round.answer === "left" ? "right" : "left";
          queueMicrotask(() => settle(wrong, true));
          return { ...s, timeLeftMs: 0 };
        }
        return { ...s, timeLeftMs: next };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.phase, state.round.round, settle]);

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

      settling.current = false;
      return {
        ...s,
        phase: "playing",
        round: freshRound(s.round.round + 1),
        feedback: null,
        timeLeftMs: timerMs(),
      };
    });
  }, []);

  const buyContinue = useCallback(async () => {
    let allowed = false;
    setState((s) => {
      if (
        s.phase !== "results" ||
        s.continueBusy ||
        s.freePlay ||
        s.resumeRound == null
      ) {
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

    settling.current = false;
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
        timeLeftMs: timerMs(),
      };
    });
  }, []);

  const playAgain = useCallback(() => {
    settling.current = false;
    setState(initialState());
  }, []);

  const roundsPerRun = PRICE_CHECK_CONFIG.roundsPerRun;
  const maxLives = PRICE_CHECK_CONFIG.maxLives;
  const timerSeconds = PRICE_CHECK_CONFIG.timerSeconds;

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
      timerSeconds,
    }),
    [
      state,
      guess,
      goNext,
      playAgain,
      buyContinue,
      roundsPerRun,
      maxLives,
      timerSeconds,
    ],
  );
}
