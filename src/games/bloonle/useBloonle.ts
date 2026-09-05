import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, utcToday } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { claimBloonleDaily } from "../../lib/bloonleDaily";
import { useQuizHeroFx } from "../../lib/quizHeroFx";
import { bloonleSolveReward } from "../rewards";
import {
  BLOONLE_CONFIG,
  evaluateGuess,
  nextMidnightMs,
  puzzleForDay,
  puzzlePractice,
  todayKey,
  type BloonlePuzzle,
  type LetterMark,
} from "./dictionary";

export type BloonleStatus = "playing" | "won" | "lost";
export type BloonleMode = "daily" | "practice";

export type BloonleGuess = {
  letters: string;
  marks: LetterMark[];
};

type Persisted = {
  day: string;
  guesses: string[];
  status: BloonleStatus;
  awarded: boolean;
  reward: number;
  /** Nice Haul / free pack already fired for today's daily. */
  haulReported: boolean;
};

const STORAGE_KEY = "bloon-arcade:bloonle:daily:v4";

function loadPersisted(day: string): Persisted | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem("bloon-arcade:bloonle:daily:v3");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted & { haulReported?: boolean };
    if (parsed.day !== day) return null;
    if (!Array.isArray(parsed.guesses)) return null;
    const status: BloonleStatus =
      parsed.status === "won" || parsed.status === "lost"
        ? parsed.status
        : "playing";
    // Migrate finished dailies as already hauled so revisit can't re-grant packs.
    const haulReported =
      typeof parsed.haulReported === "boolean"
        ? parsed.haulReported
        : status !== "playing";
    return {
      day: parsed.day,
      guesses: parsed.guesses.filter((g) => typeof g === "string"),
      status,
      awarded: Boolean(parsed.awarded),
      reward: Number(parsed.reward) || 0,
      haulReported,
    };
  } catch {
    return null;
  }
}

function savePersisted(data: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/** Sync claim so remounts can't re-fire Nice Haul before React commits. */
export function claimBloonleDailyHaulOnce(day: string): boolean {
  const saved = loadPersisted(day);
  if (!saved || saved.status === "playing") return false;
  if (saved.haulReported) return false;
  savePersisted({ ...saved, haulReported: true });
  return true;
}

function rebuildGuesses(slugs: string[], answer: string): BloonleGuess[] {
  return slugs.map((letters) => ({
    letters,
    marks: evaluateGuess(letters, answer),
  }));
}

type State = {
  mode: BloonleMode;
  day: string;
  puzzle: BloonlePuzzle;
  guesses: BloonleGuess[];
  current: string;
  status: BloonleStatus;
  toast: string | null;
  awarded: boolean;
  reward: number;
  haulReported: boolean;
  msUntilNext: number;
  /** Recent practice answers so we don't immediate-repeat. */
  recentSlugs: string[];
};

function makeDailyState(): State {
  const day = todayKey();
  const puzzle = puzzleForDay(day);
  const saved = loadPersisted(day);
  const guesses =
    saved &&
    saved.guesses.every((g) => g.length === puzzle.slug.length)
      ? rebuildGuesses(saved.guesses, puzzle.slug)
      : [];
  let status: BloonleStatus = guesses.length
    ? (saved?.status ?? "playing")
    : "playing";
  if (status === "playing") {
    if (guesses.some((g) => g.letters === puzzle.slug)) status = "won";
    else if (guesses.length >= BLOONLE_CONFIG.maxGuesses) status = "lost";
  }
  const finished = status !== "playing";
  return {
    mode: "daily",
    day,
    puzzle,
    guesses,
    current: "",
    status,
    toast: null,
    awarded: guesses.length ? (saved?.awarded ?? false) : false,
    reward: guesses.length ? (saved?.reward ?? 0) : 0,
    haulReported: finished
      ? (saved?.haulReported ?? true)
      : (saved?.haulReported ?? false),
    msUntilNext: Math.max(0, nextMidnightMs() - Date.now()),
    recentSlugs: [puzzle.slug],
  };
}

function makePracticeState(recentSlugs: string[], day: string): State {
  const puzzle = puzzlePractice(recentSlugs.slice(-8));
  return {
    mode: "practice",
    day,
    puzzle,
    guesses: [],
    current: "",
    status: "playing",
    toast: null,
    awarded: false,
    reward: 0,
    haulReported: false,
    msUntilNext: Math.max(0, nextMidnightMs() - Date.now()),
    recentSlugs: [...recentSlugs, puzzle.slug].slice(-12),
  };
}

export function useBloonle() {
  const { setCoinBalance, profile, isGuest, refreshProfile, ready } = useAuth();
  const { onCorrectCash } = useQuizHeroFx();
  const [state, setState] = useState<State>(makeDailyState);
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const toastTimer = useRef<number | null>(null);
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;
  const accountDailyReady = isGuest || (ready && Boolean(profile));
  const alreadyClaimedToday =
    !isGuest &&
    Boolean(profile?.last_bloonle_day) &&
    profile?.last_bloonle_day === utcToday();

  // Midnight rollover → new daily
  useEffect(() => {
    const id = window.setInterval(() => {
      const day = todayKey();
      setState((s) => {
        if (s.day === day) {
          return {
            ...s,
            msUntilNext: Math.max(0, nextMidnightMs() - Date.now()),
          };
        }
        return makeDailyState();
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setState((s) => ({ ...s, toast: msg }));
    toastTimer.current = window.setTimeout(() => {
      setState((s) => ({ ...s, toast: null }));
    }, 1600);
  }, []);

  const persistDaily = useCallback(
    (
      day: string,
      guesses: BloonleGuess[],
      status: BloonleStatus,
      awarded: boolean,
      reward: number,
      haulReported: boolean,
    ) => {
      savePersisted({
        day,
        guesses: guesses.map((g) => g.letters),
        status,
        awarded,
        reward,
        haulReported,
      });
    },
    [],
  );

  const awardIfNeeded = useCallback(
    async (
      mode: BloonleMode,
      _guessCount: number,
      already: boolean,
    ) => {
      if (already) return { awarded: true, reward: 0 };
      if (mode === "daily" && !isGuestRef.current) {
        const claimed = await claimBloonleDaily(_guessCount);
        if (!claimed) return { awarded: false, reward: 0 };
        if (claimed.coins != null) setCoinBalanceRef.current(claimed.coins);
        void refreshProfile();
        const reward = claimed.already ? 0 : claimed.amount;
        if (reward > 0) void onCorrectCash(setCoinBalanceRef.current, { gameId: "bloonle" });
        return { awarded: true, reward };
      }
      const reward = bloonleSolveReward(mode, _guessCount);
      if (reward <= 0) return { awarded: true, reward: 0 };
      const balance = await awardCoins(reward, "bloonle");
      if (balance != null) setCoinBalanceRef.current(balance);
      void onCorrectCash(setCoinBalanceRef.current, { gameId: "bloonle" });
      return { awarded: true, reward };
    },
    [onCorrectCash, refreshProfile],
  );

  // Account already collected today's daily - show completed, never re-haul.
  useEffect(() => {
    if (!alreadyClaimedToday) return;
    const day = utcToday();
    setState((s) => {
      if (s.mode !== "daily" || s.day !== day) return s;
      if (s.status !== "playing" && s.awarded && s.haulReported) return s;
      persistDaily(s.day, s.guesses, "won", true, s.reward, true);
      return {
        ...s,
        status: "won",
        awarded: true,
        haulReported: true,
        current: "",
      };
    });
  }, [alreadyClaimedToday, persistDaily]);

  const submit = useCallback(() => {
    setState((s) => {
      if (s.status !== "playing") return s;
      if (s.mode === "daily" && !accountDailyReady) return s;
      const len = s.puzzle.slug.length;
      if (s.current.length < len) {
        queueMicrotask(() => showToast("Not enough letters"));
        return s;
      }
      const guess = s.current.toLowerCase();
      if (!/^[a-z]+$/.test(guess) || guess.length !== len) {
        queueMicrotask(() => showToast("Not enough letters"));
        return s;
      }
      if (s.guesses.some((g) => g.letters === guess)) {
        queueMicrotask(() => showToast("Already guessed"));
        return s;
      }

      const marks = evaluateGuess(guess, s.puzzle.slug);
      const guesses = [...s.guesses, { letters: guess, marks }];
      let status: BloonleStatus = "playing";
      if (guess === s.puzzle.slug) status = "won";
      else if (guesses.length >= BLOONLE_CONFIG.maxGuesses) status = "lost";

      if (s.mode === "daily") {
        persistDaily(
          s.day,
          guesses,
          status,
          s.awarded,
          s.reward,
          s.haulReported,
        );
      }

      if (status === "won") {
        const mode = s.mode;
        const day = s.day;
        queueMicrotask(() => {
          void awardIfNeeded(mode, guesses.length, s.awarded).then((r) => {
            setState((cur) => {
              if (cur.mode !== mode || cur.day !== day) return cur;
              if (cur.puzzle.slug !== s.puzzle.slug) return cur;
              const reward = r.reward || cur.reward;
              if (mode === "daily") {
                persistDaily(
                  cur.day,
                  cur.guesses,
                  "won",
                  r.awarded,
                  reward,
                  cur.haulReported,
                );
              }
              return {
                ...cur,
                awarded: r.awarded,
                reward,
              };
            });
          });
        });
      }

      return {
        ...s,
        guesses,
        current: "",
        status,
      };
    });
  }, [accountDailyReady, awardIfNeeded, persistDaily, showToast]);

  const markHaulReported = useCallback(() => {
    setState((s) => {
      if (s.haulReported) return s;
      const next = { ...s, haulReported: true };
      if (s.mode === "daily") {
        persistDaily(
          s.day,
          s.guesses,
          s.status,
          s.awarded,
          s.reward,
          true,
        );
      }
      return next;
    });
  }, [persistDaily]);

  const playNext = useCallback(() => {
    setState((s) => {
      if (s.status === "playing") return s;
      return makePracticeState(s.recentSlugs, s.day);
    });
  }, []);

  const typeLetter = useCallback(
    (ch: string) => {
      const letter = ch.toLowerCase();
      if (!/^[a-z]$/.test(letter)) return;
      setState((s) => {
        if (s.status !== "playing") return s;
        if (s.mode === "daily" && !accountDailyReady) return s;
        if (s.current.length >= s.puzzle.slug.length) return s;
        return { ...s, current: s.current + letter };
      });
    },
    [accountDailyReady],
  );

  const backspace = useCallback(() => {
    setState((s) => {
      if (s.status !== "playing" || !s.current) return s;
      return { ...s, current: s.current.slice(0, -1) };
    });
  }, []);

  /** Replace the in-progress guess (used by native mobile keyboard). */
  const setCurrentDraft = useCallback(
    (raw: string) => {
      setState((s) => {
        if (s.status !== "playing") return s;
        if (s.mode === "daily" && !accountDailyReady) return s;
        const cleaned = raw
          .toLowerCase()
          .replace(/[^a-z]/g, "")
          .slice(0, s.puzzle.slug.length);
        if (cleaned === s.current) return s;
        return { ...s, current: cleaned };
      });
    },
    [accountDailyReady],
  );

  const keyMarks = useMemo(() => {
    const best = new Map<string, LetterMark>();
    const rank: Record<LetterMark, number> = {
      correct: 3,
      present: 2,
      absent: 1,
    };
    for (const g of state.guesses) {
      for (let i = 0; i < g.letters.length; i++) {
        const ch = g.letters[i]!;
        const m = g.marks[i]!;
        const prev = best.get(ch);
        if (!prev || rank[m] > rank[prev]) best.set(ch, m);
      }
    }
    return best;
  }, [state.guesses]);

  return useMemo(
    () => ({
      state,
      typeLetter,
      backspace,
      setCurrentDraft,
      submit,
      playNext,
      markHaulReported,
      keyMarks,
      maxGuesses: BLOONLE_CONFIG.maxGuesses,
    }),
    [
      state,
      typeLetter,
      backspace,
      setCurrentDraft,
      submit,
      playNext,
      markHaulReported,
      keyMarks,
    ],
  );
}
