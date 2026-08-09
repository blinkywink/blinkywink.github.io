import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { towerEntities } from "../../data/towers";
import type { TowerEntity } from "../../data/types";
import { awardCoins } from "../../lib/awardCoins";
import { useQuizHeroFx } from "../../lib/quizHeroFx";
import { spendCoins } from "../../lib/spendCoins";
import { preloadImage } from "../../utils/imageProcessing";
import { SHARED_RUN, isFlawlessClear, perfectRunBonus } from "../rewards";
import { ZOOMED_CONFIG } from "./config";
import { createChallenge, type Challenge } from "./questionGenerator";
import {
  calculateScore,
  loadBestScores,
  saveBestScores,
  type BestScores,
  type RunStats,
  type ScoreBreakdown,
} from "./scoring";

export type Feedback =
  | {
      kind: "correct";
      breakdown: ScoreBreakdown;
      streak: number;
    }
  | {
      kind: "miss";
      guessName: string;
      attemptsLeft: number;
    }
  | {
      kind: "wrong";
      correctName: string;
      guessName: string;
    };

export type GamePhase = "playing" | "feedback" | "results";

export type ZoomedState = {
  phase: GamePhase;
  challenge: Challenge | null;
  nextChallenge: Challenge | null;
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  answeredCount: number;
  /** Wrong guesses used on the current question (0–maxAttempts). */
  attemptsUsed: number;
  /** Run hearts remaining. */
  lives: number;
  freePlay: boolean;
  /** Entity ids guessed wrong this round (shown as crossed out). */
  eliminatedIds: string[];
  feedback: Feedback | null;
  selectedId: string | null;
  bests: BestScores;
  lastRun: RunStats | null;
  /** Next round index if the player buys a continue. */
  resumeRound: number | null;
  /** True when the main 10 finished with lives left. */
  clearedRun: boolean;
  /** Flawless clear — Cash was doubled. */
  perfectRun: boolean;
  continueError: string | null;
  continueBusy: boolean;
};

function buildRunStats(partial: {
  score: number;
  bestStreak: number;
  correctCount: number;
  answeredCount: number;
}): RunStats {
  const total = Math.max(partial.answeredCount, 1);
  return {
    score: partial.score,
    bestStreak: partial.bestStreak,
    correct: partial.correctCount,
    total: partial.answeredCount,
    accuracy: Math.round((partial.correctCount / total) * 100),
  };
}

function blankBoard(overrides: Partial<ZoomedState> = {}): ZoomedState {
  return {
    phase: "playing",
    challenge: overrides.challenge ?? createChallenge(1, towerEntities),
    nextChallenge: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    answeredCount: 0,
    attemptsUsed: 0,
    lives: ZOOMED_CONFIG.maxLives,
    freePlay: false,
    eliminatedIds: [],
    feedback: null,
    selectedId: null,
    bests: loadBestScores(),
    lastRun: null,
    resumeRound: null,
    clearedRun: false,
    perfectRun: false,
    continueError: null,
    continueBusy: false,
    ...overrides,
  };
}

export function useZoomedGame() {
  const { profile, setCoinBalance } = useAuth();
  const {
    resetRunFlags,
    streakBonusPct,
    onCorrectCash,
    onGwenStreakProc,
    tryFreeSkip,
    tryEtienneBoost,
  } = useQuizHeroFx();

  const makeChallenge = useCallback(
    (round: number, recent?: string[]) =>
      createChallenge(round, towerEntities, recent),
    [],
  );

  const [state, setState] = useState<ZoomedState>(() => blankBoard());
  const didApplyHeroInit = useRef(false);

  const recentIds = useRef<string[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const missClearTimer = useRef<number | null>(null);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;

  useEffect(() => {
    if (didApplyHeroInit.current) return;
    didApplyHeroInit.current = true;
    resetRunFlags();
    setState((s) =>
      s.score === 0 && s.answeredCount === 0 && s.challenge?.round === 1
        ? { ...s, challenge: makeChallenge(1) }
        : s,
    );
  }, [makeChallenge, resetRunFlags]);

  const preloadChallenge = useCallback(async (c: Challenge) => {
    try {
      await preloadImage(c.correct.image);
    } catch {
      // render path will surface load errors
    }
  }, []);

  useEffect(() => {
    const challenge = state.challenge;
    if (!challenge || state.phase !== "playing") return;

    void preloadChallenge(challenge);

    if (!state.nextChallenge) {
      const nextRound = challenge.round + 1;
      const withinMain =
        !state.freePlay && nextRound <= ZOOMED_CONFIG.roundsPerRun;
      if (withinMain || state.freePlay) {
        const next = makeChallenge(nextRound, recentIds.current);
        setState((s) =>
          s.nextChallenge ? s : { ...s, nextChallenge: next },
        );
        void preloadChallenge(next);
      }
    }
  }, [
    state.challenge,
    state.nextChallenge,
    state.phase,
    state.freePlay,
    preloadChallenge,
    makeChallenge,
  ]);

  useEffect(() => {
    return () => {
      if (missClearTimer.current != null) {
        window.clearTimeout(missClearTimer.current);
      }
    };
  }, []);

  const finishRun = useCallback(
    (partial: {
      score: number;
      bestStreak: number;
      correctCount: number;
      answeredCount: number;
      resumeRound: number;
      cleared: boolean;
    }) => {
      const s = stateRef.current;
      const perfect = isFlawlessClear({
        cleared: partial.cleared,
        freePlay: s.freePlay,
        lives: s.lives,
        maxLives: ZOOMED_CONFIG.maxLives,
      });
      const bonus = perfect ? perfectRunBonus(partial.score) : 0;
      if (bonus > 0) {
        void awardCoins(bonus).then((balance) => {
          if (balance != null) setCoinBalanceRef.current(balance);
        });
      }

      const lastRun = buildRunStats(partial);
      const bests = saveBestScores(lastRun);
      setState((prev) => ({
        ...prev,
        phase: "results",
        challenge: null,
        nextChallenge: null,
        feedback: null,
        selectedId: null,
        attemptsUsed: 0,
        eliminatedIds: [],
        lastRun,
        bests,
        resumeRound: partial.resumeRound,
        clearedRun: partial.cleared,
        perfectRun: perfect,
        continueError: null,
        continueBusy: false,
      }));
    },
    [],
  );

  const advanceToRound = useCallback(
    (s: ZoomedState, nextRound: number) => {
      const challenge =
        s.nextChallenge ??
        makeChallenge(nextRound, recentIds.current);

      recentIds.current = [
        ...recentIds.current.slice(-6),
        challenge.correct.id,
      ];

      let nextChallenge: Challenge | null = null;
      const preloadNext =
        s.freePlay || nextRound + 1 <= ZOOMED_CONFIG.roundsPerRun;
      if (preloadNext) {
        nextChallenge = makeChallenge(nextRound + 1, [
          ...recentIds.current,
        ]);
        void preloadChallenge(nextChallenge);
      }

      setState((prev) => ({
        ...prev,
        phase: "playing",
        challenge: {
          ...challenge,
          startedAt: performance.now(),
        },
        nextChallenge,
        feedback: null,
        selectedId: null,
        attemptsUsed: 0,
        eliminatedIds: [],
        continueError: null,
        continueBusy: false,
      }));
    },
    [makeChallenge, preloadChallenge],
  );

  const goNext = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "feedback" || !s.challenge) return;

    if (s.lives <= 0) {
      finishRun({
        score: s.score,
        bestStreak: s.bestStreak,
        correctCount: s.correctCount,
        answeredCount: s.answeredCount,
        resumeRound: s.challenge.round + 1,
        cleared: false,
      });
      return;
    }

    const nextRound = s.challenge.round + 1;

    if (!s.freePlay && s.challenge.round >= ZOOMED_CONFIG.roundsPerRun) {
      finishRun({
        score: s.score,
        bestStreak: s.bestStreak,
        correctCount: s.correctCount,
        answeredCount: s.answeredCount,
        resumeRound: nextRound,
        cleared: true,
      });
      return;
    }

    advanceToRound(s, nextRound);
  }, [advanceToRound, finishRun]);

  const buyContinue = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== "results" || s.continueBusy || s.freePlay) return;
    const resumeRound = s.resumeRound;
    if (resumeRound == null) return;

    setState((prev) => ({
      ...prev,
      continueBusy: true,
      continueError: null,
    }));

    const balance = await spendCoins(SHARED_RUN.continueCost);
    if (balance == null) {
      setState((prev) => ({
        ...prev,
        continueBusy: false,
        continueError:
          (profile?.coins ?? 0) < SHARED_RUN.continueCost
            ? "Not enough Cash."
            : "Purchase failed — try again.",
      }));
      return;
    }
    setCoinBalanceRef.current(balance);

    resetRunFlags();

    const challenge = makeChallenge(resumeRound, recentIds.current);
    recentIds.current = [
      ...recentIds.current.slice(-6),
      challenge.correct.id,
    ];
    const nextChallenge = makeChallenge(resumeRound + 1, [
      ...recentIds.current,
    ]);
    void preloadChallenge(challenge);
    void preloadChallenge(nextChallenge);

    setState((prev) => ({
      ...prev,
      phase: "playing",
      freePlay: true,
      lives: ZOOMED_CONFIG.maxLives,
      challenge: {
        ...challenge,
        startedAt: performance.now(),
      },
      nextChallenge,
      feedback: null,
      selectedId: null,
      attemptsUsed: 0,
      eliminatedIds: [],
      resumeRound: null,
      clearedRun: false,
      perfectRun: false,
      continueBusy: false,
      continueError: null,
      lastRun: null,
    }));
  }, [makeChallenge, preloadChallenge, profile?.coins, resetRunFlags]);

  const answer = useCallback((choice: TowerEntity) => {
    const s = stateRef.current;
    if (s.phase !== "playing" || !s.challenge) return;
    if (s.feedback?.kind === "miss") return;

    const elapsed = performance.now() - s.challenge.startedAt;
    const isCorrect = choice.id === s.challenge.correct.id;

    if (isCorrect) {
      const streak = s.streak + 1;
      const bestStreak = Math.max(s.bestStreak, streak);
      const attemptMult =
        ZOOMED_CONFIG.attemptScoreMultipliers[
          Math.min(
            s.attemptsUsed,
            ZOOMED_CONFIG.attemptScoreMultipliers.length - 1,
          )
        ] ?? 1;
      const breakdown = calculateScore(
        s.challenge.difficulty,
        elapsed,
        streak,
        attemptMult,
        s.challenge.round,
        streak >= 2 ? streakBonusPct : 0,
      );
      const score = s.score + breakdown.points;
      const correctCount = s.correctCount + 1;
      const answeredCount = s.answeredCount + 1;

      setState({
        ...s,
        phase: "feedback",
        score,
        streak,
        bestStreak,
        correctCount,
        answeredCount,
        selectedId: choice.id,
        feedback: { kind: "correct", breakdown, streak },
      });

      void awardCoins(breakdown.points).then((balance) => {
        if (balance != null) setCoinBalance(balance);
      });
      void onCorrectCash(setCoinBalance);
      if (streak >= 2 && streakBonusPct > 0) {
        onGwenStreakProc(streak);
      }
      return;
    }

    let attemptsUsed = s.attemptsUsed + 1;
    if (tryEtienneBoost()) {
      attemptsUsed += 1;
    }
    const lives = s.lives - 1;
    const eliminatedIds = s.eliminatedIds.includes(choice.id)
      ? s.eliminatedIds
      : [...s.eliminatedIds, choice.id];

    if (lives > 0) {
      setState({
        ...s,
        streak: 0,
        attemptsUsed,
        lives,
        eliminatedIds,
        selectedId: choice.id,
        feedback: {
          kind: "miss",
          guessName: choice.name,
          attemptsLeft: lives,
        },
      });

      if (missClearTimer.current != null) {
        window.clearTimeout(missClearTimer.current);
      }
      missClearTimer.current = window.setTimeout(() => {
        setState((prev) =>
          prev.feedback?.kind === "miss"
            ? { ...prev, feedback: null, selectedId: null }
            : prev,
        );
      }, 1100);
      return;
    }

    setState({
      ...s,
      phase: "feedback",
      streak: 0,
      attemptsUsed,
      lives: 0,
      answeredCount: s.answeredCount + 1,
      eliminatedIds,
      selectedId: choice.id,
      feedback: {
        kind: "wrong",
        correctName: s.challenge.correct.name,
        guessName: choice.name,
      },
    });
  }, [
    onCorrectCash,
    onGwenStreakProc,
    setCoinBalance,
    streakBonusPct,
    tryEtienneBoost,
  ]);

  /** Give up on this question — lose a life, reveal, then advance. */
  const skip = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "playing" || !s.challenge) return;
    if (missClearTimer.current != null) {
      window.clearTimeout(missClearTimer.current);
      missClearTimer.current = null;
    }

    const freeSkip = tryFreeSkip();
    const lives = freeSkip ? s.lives : Math.max(0, s.lives - 1);
    setState({
      ...s,
      phase: "feedback",
      streak: 0,
      lives,
      answeredCount: s.answeredCount + 1,
      selectedId: null,
      feedback: {
        kind: "wrong",
        correctName: s.challenge.correct.name,
        guessName: "Skipped",
      },
    });
  }, [tryFreeSkip]);

  const playAgain = useCallback(() => {
    if (missClearTimer.current != null) {
      window.clearTimeout(missClearTimer.current);
    }
    recentIds.current = [];
    resetRunFlags();
    setState(
      blankBoard({ bests: loadBestScores(), challenge: makeChallenge(1) }),
    );
  }, [makeChallenge, resetRunFlags]);

  return {
    state,
    answer,
    skip,
    goNext,
    playAgain,
    buyContinue,
    continueCost: SHARED_RUN.continueCost,
    roundsPerRun: ZOOMED_CONFIG.roundsPerRun,
    maxAttempts: ZOOMED_CONFIG.maxAttempts,
    maxLives: ZOOMED_CONFIG.maxLives,
  };
}
