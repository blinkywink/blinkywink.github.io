import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { useQuizHeroFx } from "../../lib/quizHeroFx";
import { spendCoins } from "../../lib/spendCoins";
import { SHARED_RUN, isFlawlessClear, perfectRunBonus } from "../rewards";
import type { PricedCombo } from "../pricecheck/costs";
import { ORDER_UP_CONFIG, pointsForPlacement } from "./config";
import {
  countCorrectPositions,
  createOrderUpRound,
  isCorrectOrder,
  type OrderUpRound,
} from "./generateRound";

export type OrderUpPhase = "playing" | "reveal" | "results";

export type OrderUpFeedback = {
  correct: boolean;
  points: number;
  /** Towers already in the right cheapest→pricey slot. */
  placedCorrect: number;
  handSize: number;
  /** Player order at lock/timeout. */
  submitted: PricedCombo[];
};

type RunStats = {
  score: number;
  correct: number;
  total: number;
  accuracy: number;
  bestStreak: number;
};

type BestScores = {
  bestScore: number;
  bestStreak: number;
  bestAccuracy: number;
};

type State = {
  phase: OrderUpPhase;
  round: OrderUpRound;
  /** Current drag order (cheapest should be index 0). */
  order: PricedCombo[];
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  answered: number;
  lives: number;
  freePlay: boolean;
  feedback: OrderUpFeedback | null;
  lastRun: RunStats | null;
  bests: BestScores;
  resumeRound: number | null;
  clearedRun: boolean;
  perfectRun: boolean;
  continueError: string | null;
  continueBusy: boolean;
  /** Milliseconds left on the clock. */
  timeLeftMs: number;
};

const STORAGE_KEY = "bloon-arcade:orderup:bests";

function loadBestScores(): BestScores {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bestScore: 0, bestStreak: 0, bestAccuracy: 0 };
    const parsed = JSON.parse(raw) as Partial<BestScores>;
    return {
      bestScore: Number(parsed.bestScore) || 0,
      bestStreak: Number(parsed.bestStreak) || 0,
      bestAccuracy: Number(parsed.bestAccuracy) || 0,
    };
  } catch {
    return { bestScore: 0, bestStreak: 0, bestAccuracy: 0 };
  }
}

function saveBestScores(bests: BestScores) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bests));
}

function mergeBests(run: RunStats, prev: BestScores): BestScores {
  return {
    bestScore: Math.max(prev.bestScore, run.score),
    bestStreak: Math.max(prev.bestStreak, run.bestStreak),
    bestAccuracy: Math.max(prev.bestAccuracy, run.accuracy),
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

function freshRound(n: number): OrderUpRound {
  return createOrderUpRound(n);
}

function initialState(): State {
  const round = freshRound(1);
  return {
    phase: "playing",
    round,
    order: round.items.slice(),
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    lives: ORDER_UP_CONFIG.maxLives,
    freePlay: false,
    feedback: null,
    lastRun: null,
    bests: loadBestScores(),
    resumeRound: null,
    clearedRun: false,
    perfectRun: false,
    continueError: null,
    continueBusy: false,
    timeLeftMs: ORDER_UP_CONFIG.timerSeconds * 1000,
  };
}

export function useOrderUp() {
  const { profile, setCoinBalance } = useAuth();
  const { streakBonusPct, onCorrectCash, onGwenStreakProc } = useQuizHeroFx();
  const [state, setState] = useState<State>(initialState);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const stateRef = useRef(state);
  stateRef.current = state;
  const submitting = useRef(false);

  const setOrder = useCallback(
    (next: PricedCombo[] | ((prev: PricedCombo[]) => PricedCombo[])) => {
      setState((s) => {
        if (s.phase !== "playing") return s;
        const order = typeof next === "function" ? next(s.order) : next;
        return { ...s, order };
      });
    },
    [],
  );

  const lockIn = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "playing" || submitting.current) return;
    submitting.current = true;

    const orderIds = s.order.map((c) => c.id);
    const ok = isCorrectOrder(orderIds, s.round.correctIds);
    const placedCorrect = countCorrectPositions(orderIds, s.round.correctIds);
    const handSize = s.round.correctIds.length;
    const streak = ok ? s.streak + 1 : 0;
    const bestStreak = Math.max(s.bestStreak, streak);
    const points = pointsForPlacement({
      round: s.round.round,
      placedCorrect,
      handSize,
      perfect: ok,
      streakAfter: streak,
      streakBonusPct: streak >= 2 ? streakBonusPct : 0,
    });
    const lives = ok ? s.lives : s.lives - 1;

    if (points > 0) {
      void awardCoins(points).then((balance) => {
        if (balance != null) setCoinBalanceRef.current(balance);
      });
      if (ok) {
        void onCorrectCash(setCoinBalanceRef.current);
        if (streak >= 2 && streakBonusPct > 0) {
          onGwenStreakProc(streak);
        }
      }
    }

    setState({
      ...s,
      phase: "reveal",
      streak,
      bestStreak,
      score: s.score + points,
      correct: s.correct + (ok ? 1 : 0),
      answered: s.answered + 1,
      lives,
      feedback: {
        correct: ok,
        points,
        placedCorrect,
        handSize,
        submitted: s.order.slice(),
      },
      timeLeftMs: 0,
    });
  }, [onCorrectCash, onGwenStreakProc, streakBonusPct]);

  // Countdown while playing
  useEffect(() => {
    if (state.phase !== "playing") return;
    let raf = 0;
    let last = performance.now();
    let left = ORDER_UP_CONFIG.timerSeconds * 1000;
    let shownSec = Math.ceil(left / 1000);
    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      left = Math.max(0, left - dt);
      if (left <= 0) {
        setState((s) => {
          if (s.phase !== "playing" || s.timeLeftMs <= 0) return s;
          queueMicrotask(() => lockIn());
          return { ...s, timeLeftMs: 0 };
        });
        return;
      }
      const sec = Math.ceil(left / 1000);
      if (sec !== shownSec) {
        shownSec = sec;
        setState((s) =>
          s.phase === "playing" ? { ...s, timeLeftMs: left } : s,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.phase, state.round.round, lockIn]);

  const goNext = useCallback(() => {
    setState((s) => {
      if (s.phase !== "reveal") return s;
      const awardBonus = (bonus: number) => {
        void awardCoins(bonus).then((balance) => {
          if (balance != null) setCoinBalanceRef.current(balance);
        });
      };
      if (s.lives <= 0) {
        const run = toRunStats(s);
        const bests = mergeBests(run, s.bests);
        saveBestScores(bests);
        return {
          ...s,
          phase: "results",
          lastRun: run,
          bests,
          feedback: null,
          resumeRound: s.round.round + 1,
          clearedRun: false,
          perfectRun: false,
          continueError: null,
          continueBusy: false,
        };
      }
      if (!s.freePlay && s.round.round >= ORDER_UP_CONFIG.roundsPerRun) {
        const perfect = isFlawlessClear({
          cleared: true,
          freePlay: s.freePlay,
          lives: s.lives,
          maxLives: ORDER_UP_CONFIG.maxLives,
        });
        const bonus = perfect ? perfectRunBonus(s.score) : 0;
        if (bonus > 0) awardBonus(bonus);
        const run = toRunStats(s);
        const bests = mergeBests(run, s.bests);
        saveBestScores(bests);
        return {
          ...s,
          phase: "results",
          lastRun: run,
          bests,
          feedback: null,
          resumeRound: s.round.round + 1,
          clearedRun: true,
          perfectRun: perfect,
          continueError: null,
          continueBusy: false,
        };
      }

      submitting.current = false;
      const round = freshRound(s.round.round + 1);
      return {
        ...s,
        phase: "playing",
        round,
        order: round.items.slice(),
        feedback: null,
        timeLeftMs: ORDER_UP_CONFIG.timerSeconds * 1000,
      };
    });
  }, []);

  const buyContinue = useCallback(async () => {
    const s = stateRef.current;
    if (
      s.phase !== "results" ||
      s.continueBusy ||
      s.freePlay ||
      s.resumeRound == null
    )
      return;

    setState((prev) => ({ ...prev, continueBusy: true, continueError: null }));
    const balance = await spendCoins(SHARED_RUN.continueCost);
    if (balance == null) {
      setState((prev) => ({
        ...prev,
        continueBusy: false,
        continueError:
          (profileRef.current?.coins ?? 0) < SHARED_RUN.continueCost
            ? "Not enough Cash."
            : "Purchase failed, try again.",
      }));
      return;
    }
    setCoinBalanceRef.current(balance);

    const resumeRound = s.resumeRound;
    const round = freshRound(resumeRound);
    submitting.current = false;
    setState((prev) => ({
      ...prev,
      phase: "playing",
      freePlay: true,
      lives: ORDER_UP_CONFIG.maxLives,
      round,
      order: round.items.slice(),
      feedback: null,
      resumeRound: null,
      clearedRun: false,
      perfectRun: false,
      continueBusy: false,
      continueError: null,
      lastRun: null,
      timeLeftMs: ORDER_UP_CONFIG.timerSeconds * 1000,
    }));
  }, []);

  const playAgain = useCallback(() => {
    submitting.current = false;
    setState(initialState());
  }, []);

  return useMemo(
    () => ({
      state,
      setOrder,
      lockIn,
      goNext,
      playAgain,
      buyContinue,
      continueCost: SHARED_RUN.continueCost,
      roundsPerRun: ORDER_UP_CONFIG.roundsPerRun,
      maxLives: ORDER_UP_CONFIG.maxLives,
      timerSeconds: ORDER_UP_CONFIG.timerSeconds,
    }),
    [
      state,
      setOrder,
      lockIn,
      goNext,
      playAgain,
      buyContinue,
    ],
  );
}
