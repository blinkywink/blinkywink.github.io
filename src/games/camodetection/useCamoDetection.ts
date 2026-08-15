import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { useQuizHeroFx } from "../../lib/quizHeroFx";
import { spendCoins } from "../../lib/spendCoins";
import { SHARED_RUN } from "../rewards";
import {
  CAMO_CLEAR_ROUNDS,
  CAMO_CONFIG,
  pointsForCorrect,
  recallSecondsForRound,
} from "./config";
import { createCamoRound, type CamoRound } from "./generateRound";
import {
  loadBestScores,
  mergeBests,
  saveBestScores,
  type BestScores,
  type RunStats,
} from "./scoring";

export type Feedback = {
  correct: boolean;
  points: number;
  /** Marks player selected. */
  picked: number[];
  /** Actual camo cells. */
  camo: number[];
  timedOut?: boolean;
};

type Phase = "watching" | "recalling" | "reveal" | "results";

type State = {
  phase: Phase;
  round: CamoRound;
  /** Whether camo art is visible during watching. */
  flashOn: boolean;
  picked: Set<number>;
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

function freshRound(n: number): CamoRound {
  return createCamoRound(n);
}

function recallMs(round: number): number {
  return recallSecondsForRound(round) * 1000;
}

function initialState(): State {
  return {
    phase: "watching",
    round: freshRound(1),
    flashOn: true,
    picked: new Set(),
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    lives: CAMO_CONFIG.maxLives,
    freePlay: false,
    feedback: null,
    lastRun: null,
    bests: loadBestScores(),
    resumeRound: null,
    clearedRun: false,
    continueError: null,
    continueBusy: false,
    timeLeftMs: recallMs(1),
  };
}

function setsEqual(a: ReadonlySet<number>, b: ReadonlyArray<number>): boolean {
  if (a.size !== b.length) return false;
  for (const i of b) {
    if (!a.has(i)) return false;
  }
  return true;
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
    flashOn: false,
  };
}

export function useCamoDetection() {
  const { profile, setCoinBalance } = useAuth();
  const { streakBonusPct, onCorrectCash, onGwenStreakProc } = useQuizHeroFx();
  const [state, setState] = useState<State>(initialState);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const streakBonusPctRef = useRef(streakBonusPct);
  streakBonusPctRef.current = streakBonusPct;
  const onCorrectCashRef = useRef(onCorrectCash);
  onCorrectCashRef.current = onCorrectCash;
  const onGwenStreakProcRef = useRef(onGwenStreakProc);
  onGwenStreakProcRef.current = onGwenStreakProc;

  // Flash camo, then open recall.
  useEffect(() => {
    if (state.phase !== "watching") return;
    setState((s) => (s.flashOn ? s : { ...s, flashOn: true }));
    const hide = window.setTimeout(() => {
      setState((s) => {
        if (s.phase !== "watching") return s;
        return { ...s, flashOn: false };
      });
    }, state.round.flashMs);
    const open = window.setTimeout(() => {
      setState((s) => {
        if (s.phase !== "watching") return s;
        return {
          ...s,
          phase: "recalling",
          flashOn: false,
          picked: new Set(),
          timeLeftMs: recallMs(s.round.round),
        };
      });
    }, state.round.flashMs + 220);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(open);
    };
  }, [state.phase, state.round.round, state.round.flashMs]);

  const toggleCell = useCallback((index: number) => {
    setState((s) => {
      if (s.phase !== "recalling") return s;
      const next = new Set(s.picked);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...s, picked: next };
    });
  }, []);

  const settle = useCallback((timedOut: boolean) => {
    let awardPoints = 0;
    let awardStreak = 0;
    let awardBonusPct = 0;
    setState((s) => {
      if (s.phase !== "recalling") return s;
      const bonusPct = streakBonusPctRef.current;
      const ok = !timedOut && setsEqual(s.picked, s.round.camo);
      const streak = ok ? s.streak + 1 : 0;
      const bestStreak = Math.max(s.bestStreak, streak);
      const points = ok
        ? pointsForCorrect(s.round.round, streak, streak >= 2 ? bonusPct : 0)
        : 0;
      const lives = ok ? s.lives : s.lives - 1;
      const feedback: Feedback = {
        correct: ok,
        points,
        picked: [...s.picked].sort((a, b) => a - b),
        camo: s.round.camo,
        timedOut: timedOut || undefined,
      };
      if (ok && points > 0) {
        awardPoints = points;
        awardStreak = streak;
        awardBonusPct = bonusPct;
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
        flashOn: false,
      };
    });
    if (awardPoints > 0) {
      void awardCoins(awardPoints).then((balance) => {
        if (balance != null) setCoinBalanceRef.current(balance);
      });
      void onCorrectCashRef.current(setCoinBalanceRef.current);
      if (awardStreak >= 2 && awardBonusPct > 0) {
        onGwenStreakProcRef.current(awardStreak);
      }
    }
  }, []);

  const submit = useCallback(() => {
    settle(false);
  }, [settle]);

  // Recall countdown
  useEffect(() => {
    if (state.phase !== "recalling") return;
    let raf = 0;
    let last = performance.now();
    let timedOut = false;
    let left = recallMs(state.round.round);
    let shownSec = Math.ceil(left / 1000);
    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      left = Math.max(0, left - dt);
      if (left <= 0) {
        setState((s) => {
          if (s.phase !== "recalling" || s.timeLeftMs <= 0 || timedOut) return s;
          timedOut = true;
          queueMicrotask(() => settle(true));
          return { ...s, timeLeftMs: 0 };
        });
        return;
      }
      const sec = Math.ceil(left / 1000);
      if (sec !== shownSec) {
        shownSec = sec;
        setState((s) =>
          s.phase === "recalling" ? { ...s, timeLeftMs: left } : s,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.phase, state.round.round, settle]);

  const goNext = useCallback(() => {
    setState((s) => {
      if (s.phase !== "reveal") return s;
      if (s.lives <= 0) {
        const rounds = s.answered;
        return finishRun(s, {
          resumeRound: s.round.round + 1,
          cleared: rounds >= CAMO_CLEAR_ROUNDS,
        });
      }

      const nextRound = s.round.round + 1;
      return {
        ...s,
        phase: "watching",
        round: freshRound(nextRound),
        picked: new Set(),
        feedback: null,
        flashOn: true,
        timeLeftMs: recallMs(nextRound),
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
            : "Purchase failed, try again.",
      }));
      return;
    }
    setCoinBalanceRef.current(balance);

    setState((s) => {
      const resumeRound = s.resumeRound ?? s.round.round + 1;
      return {
        ...s,
        phase: "watching",
        freePlay: true,
        lives: CAMO_CONFIG.maxLives,
        round: freshRound(resumeRound),
        picked: new Set(),
        feedback: null,
        flashOn: true,
        resumeRound: null,
        clearedRun: false,
        continueBusy: false,
        continueError: null,
        lastRun: null,
        timeLeftMs: recallMs(resumeRound),
      };
    });
  }, []);

  const playAgain = useCallback(() => {
    setState(initialState());
  }, []);

  return useMemo(
    () => ({
      state,
      toggleCell,
      submit,
      goNext,
      playAgain,
      buyContinue,
      continueCost: SHARED_RUN.continueCost,
      maxLives: CAMO_CONFIG.maxLives,
      clearRounds: CAMO_CLEAR_ROUNDS,
    }),
    [state, toggleCell, submit, goNext, playAgain, buyContinue],
  );
}
