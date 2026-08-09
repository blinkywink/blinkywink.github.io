import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { maps } from "../../data/maps";
import type { MapEntity } from "../../data/types";
import { awardCoins } from "../../lib/awardCoins";
import { useQuizHeroFx } from "../../lib/quizHeroFx";
import { spendCoins } from "../../lib/spendCoins";
import { preloadImage } from "../../utils/imageProcessing";
import { SHARED_RUN, isFlawlessClear, perfectRunBonus } from "../rewards";
import { GEOGUESSR_CONFIG } from "./config";
import { createMapChallenge, type MapChallenge } from "./questionGenerator";
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

export type GeoguessrState = {
  phase: GamePhase;
  challenge: MapChallenge | null;
  nextChallenge: MapChallenge | null;
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

function blankBoard(
  challenge: MapChallenge,
  overrides: Partial<GeoguessrState> = {},
): GeoguessrState {
  return {
    phase: "playing",
    challenge,
    nextChallenge: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    answeredCount: 0,
    attemptsUsed: 0,
    lives: GEOGUESSR_CONFIG.maxLives,
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

export function useGeoguessr() {
  const { profile, setCoinBalance } = useAuth();
  const {
    resetRunFlags,
    streakBonusPct,
    onCorrectCash,
    onGwenStreakProc,
  } = useQuizHeroFx();

  const makeMapChallenge = useCallback(
    (round: number, recent: string[] = []) =>
      createMapChallenge(round, maps, recent),
    [],
  );

  const [state, setState] = useState<GeoguessrState>(() =>
    blankBoard(createMapChallenge(1, maps)),
  );

  const recentIds = useRef<string[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const missClearTimer = useRef<number | null>(null);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const runInitialized = useRef(false);

  useEffect(() => {
    if (runInitialized.current) return;
    runInitialized.current = true;
    resetRunFlags();
    setState((s) => ({ ...s, challenge: makeMapChallenge(1) }));
  }, [resetRunFlags, makeMapChallenge]);

  const preloadChallenge = useCallback(async (c: MapChallenge) => {
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
        !state.freePlay && nextRound <= GEOGUESSR_CONFIG.roundsPerRun;
      if (withinMain || state.freePlay) {
        const next = makeMapChallenge(nextRound, recentIds.current);
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
    makeMapChallenge,
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
        maxLives: GEOGUESSR_CONFIG.maxLives,
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
    (s: GeoguessrState, nextRound: number) => {
      const challenge =
        s.nextChallenge ??
        makeMapChallenge(nextRound, recentIds.current);

      recentIds.current = [
        ...recentIds.current.slice(-6),
        challenge.correct.id,
      ];

      let nextChallenge: MapChallenge | null = null;
      const preloadNext =
        s.freePlay || nextRound + 1 <= GEOGUESSR_CONFIG.roundsPerRun;
      if (preloadNext) {
        nextChallenge = makeMapChallenge(nextRound + 1, [
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
    [preloadChallenge, makeMapChallenge],
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

    if (!s.freePlay && s.challenge.round >= GEOGUESSR_CONFIG.roundsPerRun) {
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

    const challenge = makeMapChallenge(resumeRound, recentIds.current);
    recentIds.current = [
      ...recentIds.current.slice(-6),
      challenge.correct.id,
    ];
    const nextChallenge = makeMapChallenge(resumeRound + 1, [
      ...recentIds.current,
    ]);
    void preloadChallenge(challenge);
    void preloadChallenge(nextChallenge);

    setState((prev) => ({
      ...prev,
      phase: "playing",
      freePlay: true,
      lives: GEOGUESSR_CONFIG.maxLives,
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
  }, [preloadChallenge, profile?.coins, makeMapChallenge, resetRunFlags]);

  const answer = useCallback((choice: MapEntity) => {
    const s = stateRef.current;
    if (s.phase !== "playing" || !s.challenge) return;
    if (s.feedback?.kind === "miss") return;

    const elapsed = performance.now() - s.challenge.startedAt;
    const isCorrect = choice.id === s.challenge.correct.id;

    if (isCorrect) {
      const streak = s.streak + 1;
      const bestStreak = Math.max(s.bestStreak, streak);
      const attemptMult =
        GEOGUESSR_CONFIG.attemptScoreMultipliers[
          Math.min(
            s.attemptsUsed,
            GEOGUESSR_CONFIG.attemptScoreMultipliers.length - 1,
          )
        ] ?? 1;
      const breakdown = calculateScore(
        s.challenge.difficulty,
        elapsed,
        streak,
        attemptMult,
        s.challenge.round,
        streakBonusPct,
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
        if (balance != null) setCoinBalanceRef.current(balance);
      });
      void onCorrectCash(setCoinBalanceRef.current);
      onGwenStreakProc(streak);
      return;
    }

    const attemptsUsed = s.attemptsUsed + 1;
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
  }, [streakBonusPct, onCorrectCash, onGwenStreakProc]);

  const skip = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "playing" || !s.challenge) return;
    if (missClearTimer.current != null) {
      window.clearTimeout(missClearTimer.current);
      missClearTimer.current = null;
    }

    const lives = Math.max(0, s.lives - 1);
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
  }, []);

  const playAgain = useCallback(() => {
    if (missClearTimer.current != null) {
      window.clearTimeout(missClearTimer.current);
    }
    recentIds.current = [];
    resetRunFlags();
    setState(blankBoard(makeMapChallenge(1), { bests: loadBestScores() }));
  }, [makeMapChallenge, resetRunFlags]);

  return {
    state,
    answer,
    skip,
    goNext,
    playAgain,
    buyContinue,
    continueCost: SHARED_RUN.continueCost,
    roundsPerRun: GEOGUESSR_CONFIG.roundsPerRun,
    maxAttempts: GEOGUESSR_CONFIG.maxAttempts,
    maxLives: GEOGUESSR_CONFIG.maxLives,
  };
}
