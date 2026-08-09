import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { spendCoins } from "../../lib/spendCoins";
import { SHARED_RUN, isFlawlessClear, perfectRunBonus } from "../rewards";
import { CAMO_CONFIG, pointsForCorrect } from "./config";
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
  perfectRun: boolean;
  continueError: string | null;
  continueBusy: boolean;
  timeLeftMs: number;
};

function freshRound(n: number): CamoRound {
  return createCamoRound(n);
}

function recallMs(): number {
  return CAMO_CONFIG.recallSeconds * 1000;
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
    perfectRun: false,
    continueError: null,
    continueBusy: false,
    timeLeftMs: recallMs(),
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
  onPerfectBonus?: (bonus: number) => void,
): State {
  const perfect = isFlawlessClear({
    cleared: opts.cleared,
    freePlay: s.freePlay,
    lives: s.lives,
    maxLives: CAMO_CONFIG.maxLives,
  });
  const bonus = perfect ? perfectRunBonus(s.score) : 0;
  if (bonus > 0) onPerfectBonus?.(bonus);

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
    perfectRun: perfect,
    continueError: null,
    continueBusy: false,
    timeLeftMs: 0,
    flashOn: false,
  };
}

export function useCamoDetection() {
  const { profile, setCoinBalance } = useAuth();
  const [state, setState] = useState<State>(initialState);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const settling = useRef(false);

  // Flash camo, then open recall.
  useEffect(() => {
    if (state.phase !== "watching") return;
    settling.current = false;
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
          timeLeftMs: recallMs(),
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
    setState((s) => {
      if (s.phase !== "recalling" || settling.current) return s;
      settling.current = true;
      const ok = !timedOut && setsEqual(s.picked, s.round.camo);
      const streak = ok ? s.streak + 1 : 0;
      const bestStreak = Math.max(s.bestStreak, streak);
      const points = ok ? pointsForCorrect(s.round.round, streak) : 0;
      const lives = ok ? s.lives : s.lives - 1;
      const feedback: Feedback = {
        correct: ok,
        points,
        picked: [...s.picked].sort((a, b) => a - b),
        camo: s.round.camo,
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
        flashOn: false,
      };
    });
  }, []);

  const submit = useCallback(() => {
    settle(false);
  }, [settle]);

  // Recall countdown
  useEffect(() => {
    if (state.phase !== "recalling") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setState((s) => {
        if (s.phase !== "recalling") return s;
        const next = Math.max(0, s.timeLeftMs - dt);
        if (next <= 0 && s.timeLeftMs > 0) {
          queueMicrotask(() => settle(true));
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
      const awardBonus = (bonus: number) => {
        void awardCoins(bonus).then((balance) => {
          if (balance != null) setCoinBalanceRef.current(balance);
        });
      };
      if (s.lives <= 0) {
        return finishRun(
          s,
          { resumeRound: s.round.round + 1, cleared: false },
          awardBonus,
        );
      }

      if (!s.freePlay && s.round.round >= CAMO_CONFIG.roundsPerRun) {
        return finishRun(
          s,
          { resumeRound: s.round.round + 1, cleared: true },
          awardBonus,
        );
      }

      settling.current = false;
      return {
        ...s,
        phase: "watching",
        round: freshRound(s.round.round + 1),
        picked: new Set(),
        feedback: null,
        flashOn: true,
        timeLeftMs: recallMs(),
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
        phase: "watching",
        freePlay: true,
        lives: CAMO_CONFIG.maxLives,
        round: freshRound(resumeRound),
        picked: new Set(),
        feedback: null,
        flashOn: true,
        resumeRound: null,
        clearedRun: false,
        perfectRun: false,
        continueBusy: false,
        continueError: null,
        lastRun: null,
        timeLeftMs: recallMs(),
      };
    });
  }, []);

  const playAgain = useCallback(() => {
    settling.current = false;
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
      roundsPerRun: CAMO_CONFIG.roundsPerRun,
      maxLives: CAMO_CONFIG.maxLives,
      recallSeconds: CAMO_CONFIG.recallSeconds,
    }),
    [
      state,
      toggleCell,
      submit,
      goNext,
      playAgain,
      buyContinue,
    ],
  );
}
