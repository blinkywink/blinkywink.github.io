import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useGameFarm } from "../../components/GameFarmGate";
import { awardCoins } from "../../lib/awardCoins";
import { createInstantPlayGuard } from "../../lib/instantPlayGuard";
import { useQuizHeroFx } from "../../lib/quizHeroFx";
import { spendCoins } from "../../lib/spendCoins";
import { SHARED_RUN, isFlawlessClear, perfectRunBonus } from "../rewards";
import {
  PRICE_CHECK_CONFIG,
  penaltyForWrong,
  pointsForCorrect,
} from "./config";
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
  /** Cash earned this answer (0 on miss). */
  points: number;
  /** Cash deducted this answer (0 on hit). */
  penalty: number;
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
  perfectRun: boolean;
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
    perfectRun: false,
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
  const perfect = isFlawlessClear({
    cleared: opts.cleared,
    freePlay: s.freePlay,
    lives: s.lives,
    maxLives: PRICE_CHECK_CONFIG.maxLives,
  });

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
  };
}

function applyGuess(
  s: State,
  side: Guess,
  timedOut: boolean,
  streakBonusPct: number,
): State {
  if (s.phase !== "playing") return s;
  const ok = !timedOut && side === s.round.answer;
  const streak = ok ? s.streak + 1 : 0;
  const bestStreak = Math.max(s.bestStreak, streak);
  const points = ok
    ? pointsForCorrect(s.round.round, streak, streak >= 2 ? streakBonusPct : 0)
    : 0;
  const penalty = ok ? 0 : penaltyForWrong(s.round.round);
  const lives = ok ? s.lives : s.lives - 1;
  const feedback: Feedback = {
    guess: side,
    correct: ok,
    leftTotal: s.round.left.total,
    rightTotal: s.round.right.total,
    points,
    penalty,
    timedOut: timedOut || undefined,
  };
  return {
    ...s,
    phase: "reveal",
    streak,
    bestStreak,
    score: Math.max(0, s.score + points - penalty),
    correct: s.correct + (ok ? 1 : 0),
    answered: s.answered + 1,
    lives,
    feedback,
    timeLeftMs: 0,
  };
}

function advanceReveal(s: State, prepared?: PriceRound | null): State {
  if (s.phase !== "reveal") return s;
  if (s.lives <= 0) {
    return finishRun(s, { resumeRound: s.round.round + 1, cleared: false });
  }
  if (!s.freePlay && s.round.round >= PRICE_CHECK_CONFIG.roundsPerRun) {
    return finishRun(s, { resumeRound: s.round.round + 1, cleared: true });
  }
  return {
    ...s,
    phase: "playing",
    round: prepared ?? freshRound(s.round.round + 1),
    feedback: null,
    timeLeftMs: timerMs(),
  };
}

export function usePriceCheck() {
  const { profile, setCoinBalance } = useAuth();
  const farm = useGameFarm();
  const { streakBonusPct, onCorrectCash, onGwenStreakProc } = useQuizHeroFx();
  const [state, setState] = useState<State>(initialState);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const streakBonusRef = useRef(streakBonusPct);
  streakBonusRef.current = streakBonusPct;
  const canPayRef = useRef(true);
  canPayRef.current = farm?.canPay !== false && !farm?.isMutedNow?.();
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
  const roundShownAt = useRef(
    typeof performance !== "undefined" ? performance.now() : 0,
  );
  const revealAt = useRef(0);
  const paidAnswered = useRef(0);
  const perfectPaid = useRef(false);
  const nextRoundRef = useRef<PriceRound | null>(null);

  const tripSpam = useCallback(() => {
    canPayRef.current = false;
    farmRef.current?.reportInstantSpam();
  }, []);

  const guess = useCallback(
    (side: Guess) => {
      // Answering in the first 2s, multiple rounds in a row = cheating.
      const instant =
        typeof performance !== "undefined" &&
        performance.now() - roundShownAt.current < 2000;
      if (guard.current.markAction(instant)) tripSpam();
      setState((s) => applyGuess(s, side, false, streakBonusRef.current));
    },
    [tripSpam],
  );

  useEffect(() => {
    if (state.phase === "playing") {
      // Do NOT reset the instant streak here — it must stack across rounds.
      roundShownAt.current =
        typeof performance !== "undefined" ? performance.now() : 0;
    }
    if (state.phase === "reveal") {
      revealAt.current =
        typeof performance !== "undefined" ? performance.now() : 0;
    }
  }, [state.phase, state.round.round]);

  useEffect(() => {
    if (state.phase !== "reveal" || !state.feedback) return;
    if (paidAnswered.current >= state.answered) return;
    paidAnswered.current = state.answered;
    const fb = state.feedback;
    if (fb.correct && fb.points > 0) {
      if (canPayRef.current) {
        if (guard.current.markAward()) {
          tripSpam();
        } else {
          void awardCoins(fb.points, "pricecheck").then((balance) => {
            if (balance != null) setCoinBalanceRef.current(balance);
          });
          void onCorrectCash(setCoinBalanceRef.current, {
            gameId: "pricecheck",
          });
        }
      }
      if (state.streak >= 2 && streakBonusRef.current > 0) {
        onGwenStreakProc(state.streak);
      }
    } else if (fb.penalty > 0) {
      const balance = profileRef.current?.coins ?? 0;
      const take = Math.min(fb.penalty, Math.max(0, balance));
      if (take > 0) {
        void spendCoins(take).then((next) => {
          if (next != null) setCoinBalanceRef.current(next);
        });
      }
    }
  }, [
    state.phase,
    state.feedback,
    state.answered,
    state.streak,
    onCorrectCash,
    onGwenStreakProc,
    tripSpam,
  ]);

  useEffect(() => {
    if (state.phase !== "results") {
      perfectPaid.current = false;
      return;
    }
    if (!state.perfectRun || perfectPaid.current) return;
    perfectPaid.current = true;
    const bonus = perfectRunBonus(state.score);
    if (bonus <= 0 || !canPayRef.current) return;
    void awardCoins(bonus, "pricecheck").then((balance) => {
      if (balance != null) setCoinBalanceRef.current(balance);
    });
  }, [state.phase, state.perfectRun, state.score]);

  useEffect(() => {
    if (state.phase !== "reveal") {
      nextRoundRef.current = null;
      return;
    }
    if (
      state.lives <= 0 ||
      (!state.freePlay && state.round.round >= PRICE_CHECK_CONFIG.roundsPerRun)
    ) {
      nextRoundRef.current = null;
      return;
    }
    nextRoundRef.current = freshRound(state.round.round + 1);
  }, [state.phase, state.round.round, state.lives, state.freePlay]);

  // Countdown while playing
  useEffect(() => {
    if (state.phase !== "playing") return;
    let raf = 0;
    let last = performance.now();
    let left = timerMs();
    let shownSec = Math.ceil(left / 1000);
    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      left = Math.max(0, left - dt);
      if (left <= 0) {
        setState((s) => {
          if (s.phase !== "playing") return s;
          const wrong: Guess = s.round.answer === "left" ? "right" : "left";
          return applyGuess(s, wrong, true, streakBonusRef.current);
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
  }, [state.phase, state.round.round]);

  const goNext = useCallback(() => {
    const instant =
      typeof performance !== "undefined" &&
      performance.now() - revealAt.current < 800;
    if (guard.current.markNext(instant)) tripSpam();
    setState((s) => {
      const prepared = nextRoundRef.current;
      nextRoundRef.current = null;
      return advanceReveal(s, prepared);
    });
  }, [tripSpam]);

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
        phase: "playing",
        freePlay: true,
        lives: PRICE_CHECK_CONFIG.maxLives,
        round: freshRound(resumeRound),
        feedback: null,
        resumeRound: null,
        clearedRun: false,
        perfectRun: false,
        continueBusy: false,
        continueError: null,
        lastRun: null,
        timeLeftMs: timerMs(),
      };
    });
  }, []);

  const playAgain = useCallback(() => {
    paidAnswered.current = 0;
    perfectPaid.current = false;
    guard.current.reset();
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
