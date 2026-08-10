import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import {
  APPROACH_S,
  CASH_PER_GOOD,
  CASH_PER_GREAT,
  CASH_PER_PERFECT,
  EMPTY_STREAK_KILL,
  HERO_CLEAR_BONUS,
  HERO_CLEAR_RATIO,
  HERO_LIVES,
  KEY_TO_LANE,
  WINDOW_GOOD,
  judgeOffset,
  leadInSeconds,
  type Judge,
} from "./config";
import { downloadSng, searchEnchor, type EnchorHit } from "./enchorApi";
import { loadSongFromSng, revokeLoadedSong, type LoadedSong } from "./loadSng";
import type { ChartNote } from "./parseChartFile";

export type ActiveNote = ChartNote & {
  id: number;
  resolved: boolean;
  result?: Judge;
};

export type HeroPhase =
  | "browse"
  | "loading"
  | "ready"
  | "playing"
  | "results";

export type HeroState = {
  phase: HeroPhase;
  query: string;
  results: EnchorHit[];
  searching: boolean;
  error: string | null;
  songTime: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  lives: number;
  cashEarned: number;
  lastJudge: Judge | null;
  cleared: boolean;
  countdown: string | null;
  pressed: number[];
  burst: { lane: number; judge: Judge; id: number } | null;
  emptyStreak: number;
  title: string;
  artist: string;
  artUrl: string | null;
  noteCount: number;
  duration: number;
};

const INITIAL: HeroState = {
  phase: "browse",
  query: "",
  results: [],
  searching: false,
  error: null,
  songTime: 0,
  combo: 0,
  maxCombo: 0,
  perfect: 0,
  great: 0,
  good: 0,
  miss: 0,
  lives: HERO_LIVES,
  cashEarned: 0,
  lastJudge: null,
  cleared: false,
  countdown: null,
  pressed: [],
  burst: null,
  emptyStreak: 0,
  title: "",
  artist: "",
  artUrl: null,
  noteCount: 0,
  duration: 0,
};

function cashFor(j: Judge): number {
  if (j === "perfect") return CASH_PER_PERFECT;
  if (j === "great") return CASH_PER_GREAT;
  if (j === "good") return CASH_PER_GOOD;
  return 0;
}

function countdownFromSongTime(songTime: number, bpm: number): string | null {
  if (songTime >= 0.35) return null;
  const beat = 60 / bpm;
  if (songTime >= 0) return "GO";
  const beatIndex = Math.floor(songTime / beat);
  const n = -beatIndex;
  if (n < 1 || n > 8) return null;
  return String(n);
}

export function useBloonHero() {
  const { setCoinBalance } = useAuth();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;

  const [state, setState] = useState<HeroState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const songRef = useRef<LoadedSong | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const notesRef = useRef<ActiveNote[]>([]);
  const durationRef = useRef(0);
  const leadInRef = useRef(leadInSeconds(120));
  const originRef = useRef(0); // performance.now when songTime 0
  const frameRef = useRef(0);
  const pendingCashRef = useRef(0);
  const attemptedRef = useRef(0);
  const hitsRef = useRef(0);
  const burstIdRef = useRef(0);
  const pressTimers = useRef<Record<number, number>>({});

  const flushCash = useCallback(async () => {
    const amount = pendingCashRef.current;
    if (amount <= 0) return;
    pendingCashRef.current = 0;
    const balance = await awardCoins(amount);
    if (balance != null) setCoinBalanceRef.current(balance);
  }, []);

  const cleanupSong = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    revokeLoadedSong(songRef.current);
    songRef.current = null;
  }, []);

  const setQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, query }));
  }, []);

  const search = useCallback(async (query?: string) => {
    const q = (query ?? stateRef.current.query).trim();
    if (!q) return;
    setState((prev) => ({
      ...prev,
      searching: true,
      error: null,
      query: q,
      phase: "browse",
    }));
    try {
      const res = await searchEnchor(q);
      setState((prev) => ({
        ...prev,
        searching: false,
        results: res.data ?? [],
        error: res.found === 0 ? "No guitar Expert charts found." : null,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        searching: false,
        error: e instanceof Error ? e.message : "Search failed",
      }));
    }
  }, []);

  const pickSong = useCallback(
    async (hit: EnchorHit) => {
      cleanupSong();
      setState((prev) => ({
        ...prev,
        phase: "loading",
        error: null,
        title: hit.name,
        artist: hit.artist,
      }));
      try {
        const buf = await downloadSng(hit.md5);
        const loaded = await loadSongFromSng(buf);
        songRef.current = loaded;
        const audio = new Audio(loaded.audioUrl);
        audio.preload = "auto";
        await audio.load();
        // wait until we can play
        await new Promise<void>((resolve, reject) => {
          const ok = () => {
            cleanup();
            resolve();
          };
          const fail = () => {
            cleanup();
            reject(new Error("Could not load song audio"));
          };
          const cleanup = () => {
            audio.removeEventListener("canplaythrough", ok);
            audio.removeEventListener("error", fail);
          };
          audio.addEventListener("canplaythrough", ok, { once: true });
          audio.addEventListener("error", fail, { once: true });
          // Opus often fires loadeddata first
          if (audio.readyState >= 3) ok();
        });
        audioRef.current = audio;
        durationRef.current = Math.max(
          loaded.chart.duration,
          Number.isFinite(audio.duration) ? audio.duration : 0,
          (hit.song_length || 0) / 1000,
        );
        setState((prev) => ({
          ...prev,
          phase: "ready",
          title: loaded.chart.name || hit.name,
          artist: loaded.chart.artist || hit.artist,
          artUrl: loaded.artUrl,
          noteCount: loaded.chart.notes.length,
          duration: durationRef.current,
          error: null,
        }));
      } catch (e) {
        cleanupSong();
        setState((prev) => ({
          ...prev,
          phase: "browse",
          error: e instanceof Error ? e.message : "Failed to load chart",
        }));
      }
    },
    [cleanupSong],
  );

  const flashPress = useCallback((lane: number) => {
    setState((prev) => ({
      ...prev,
      pressed: prev.pressed.includes(lane)
        ? prev.pressed
        : [...prev.pressed, lane],
    }));
    if (pressTimers.current[lane]) {
      window.clearTimeout(pressTimers.current[lane]);
    }
    pressTimers.current[lane] = window.setTimeout(() => {
      setState((prev) => ({
        ...prev,
        pressed: prev.pressed.filter((l) => l !== lane),
      }));
    }, 110);
  }, []);

  const songTimeNow = useCallback(() => {
    const audio = audioRef.current;
    const song = songRef.current;
    if (!audio || !song) return 0;
    // During lead-in, audio hasn't started — use wall clock
    if (audio.paused && stateRef.current.phase === "playing") {
      const wall = (performance.now() - originRef.current) / 1000;
      return wall - leadInRef.current;
    }
    const delay = (song.delayMs || 0) / 1000;
    return audio.currentTime - delay;
  }, []);

  const finishRun = useCallback(
    (livesAfter: number) => {
      const attempted = Math.max(1, attemptedRef.current);
      const ratio = hitsRef.current / attempted;
      const cleared = ratio >= HERO_CLEAR_RATIO;
      setState((prev) => ({
        ...prev,
        phase: "results",
        lives: livesAfter,
        cleared,
        countdown: null,
      }));
      if (audioRef.current) {
        audioRef.current.pause();
      }
      void (async () => {
        let grant = pendingCashRef.current;
        pendingCashRef.current = 0;
        if (cleared) {
          grant += HERO_CLEAR_BONUS;
          setState((prev) =>
            prev.phase === "results"
              ? { ...prev, cashEarned: prev.cashEarned + HERO_CLEAR_BONUS }
              : prev,
          );
        }
        if (grant > 0) {
          const balance = await awardCoins(grant);
          if (balance != null) setCoinBalanceRef.current(balance);
        }
      })();
    },
    [],
  );

  const start = useCallback(() => {
    const song = songRef.current;
    const audio = audioRef.current;
    if (!song || !audio) return;
    pendingCashRef.current = 0;
    attemptedRef.current = 0;
    hitsRef.current = 0;
    notesRef.current = song.chart.notes.map((n, i) => ({
      ...n,
      id: i,
      resolved: false,
    }));
    leadInRef.current = leadInSeconds(120);
    originRef.current = performance.now();
    audio.pause();
    audio.currentTime = 0;
    setState((prev) => ({
      ...INITIAL,
      phase: "playing",
      query: prev.query,
      results: prev.results,
      title: prev.title,
      artist: prev.artist,
      songTime: -leadInRef.current,
      countdown: "4",
      lives: HERO_LIVES,
    }));
  }, []);

  const backToBrowse = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    cleanupSong();
    setState((prev) => ({
      ...INITIAL,
      query: prev.query,
      results: prev.results,
      phase: "browse",
    }));
  }, [cleanupSong]);

  const restart = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState((prev) => ({
      ...INITIAL,
      phase: "ready",
      query: prev.query,
      results: prev.results,
      title: prev.title,
      artist: prev.artist,
    }));
  }, []);

  const applyHit = useCallback(
    (lane: number) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      flashPress(lane);
      const now = songTimeNow();
      if (now < 0) return;

      let best: ActiveNote | null = null;
      let bestAbs = Infinity;
      for (const n of notesRef.current) {
        if (n.resolved || n.lane !== lane) continue;
        const a = Math.abs(now - n.t);
        if (a > WINDOW_GOOD) continue;
        if (a < bestAbs) {
          bestAbs = a;
          best = n;
        }
      }

      const punishEmpty = () => {
        const streak = stateRef.current.emptyStreak + 1;
        let lives = stateRef.current.lives;
        if (streak >= 2) lives = Math.max(0, lives - 1);
        if (streak >= EMPTY_STREAK_KILL) lives = 0;
        burstIdRef.current += 1;
        const burstId = burstIdRef.current;
        const next = {
          ...stateRef.current,
          combo: 0,
          lives,
          emptyStreak: streak,
          lastJudge: "miss" as const,
          burst: { lane, judge: "miss" as const, id: burstId },
        };
        stateRef.current = next;
        setState(next);
      };

      if (!best) {
        punishEmpty();
        return;
      }
      const judge = judgeOffset(now - best.t);
      if (!judge) {
        punishEmpty();
        return;
      }

      best.resolved = true;
      best.result = judge;
      attemptedRef.current += 1;
      hitsRef.current += 1;
      const pay = cashFor(judge);
      pendingCashRef.current += pay;
      burstIdRef.current += 1;
      const burstId = burstIdRef.current;
      setState((prev) => {
        const combo = prev.combo + 1;
        return {
          ...prev,
          combo,
          maxCombo: Math.max(prev.maxCombo, combo),
          perfect: prev.perfect + (judge === "perfect" ? 1 : 0),
          great: prev.great + (judge === "great" ? 1 : 0),
          good: prev.good + (judge === "good" ? 1 : 0),
          cashEarned: prev.cashEarned + pay,
          lastJudge: judge,
          emptyStreak: 0,
          burst: { lane, judge, id: burstId },
        };
      });
      window.setTimeout(() => {
        setState((prev) =>
          prev.burst?.id === burstId ? { ...prev, burst: null } : prev,
        );
      }, 360);
      if (pendingCashRef.current >= 40) void flushCash();
    },
    [flashPress, flushCash, songTimeNow],
  );

  // Playback clock
  useEffect(() => {
    if (state.phase !== "playing") {
      cancelAnimationFrame(frameRef.current);
      return;
    }

    let audioStarted = false;
    const tick = () => {
      const leadIn = leadInRef.current;
      const wall = (performance.now() - originRef.current) / 1000;
      let now = wall - leadIn;

      const audio = audioRef.current;
      if (!audioStarted && now >= 0 && audio) {
        audioStarted = true;
        audio.currentTime = 0;
        void audio.play().catch(() => {
          /* autoplay may need gesture — start() is from click so OK */
        });
      }
      if (audioStarted && audio && !audio.paused) {
        const delay = (songRef.current?.delayMs || 0) / 1000;
        now = audio.currentTime - delay;
      }

      const countdown = countdownFromSongTime(now, 120);
      let missed = 0;
      let missLane = -1;
      for (const n of notesRef.current) {
        if (n.resolved) continue;
        if (now - n.t > WINDOW_GOOD) {
          n.resolved = true;
          n.result = "miss";
          missed += 1;
          missLane = n.lane;
          attemptedRef.current += 1;
        }
      }

      let livesAfter = stateRef.current.lives;
      if (missed > 0) {
        livesAfter = Math.max(0, livesAfter - missed);
        burstIdRef.current += 1;
        const next = {
          ...stateRef.current,
          miss: stateRef.current.miss + missed,
          combo: 0,
          lives: livesAfter,
          lastJudge: "miss" as const,
          songTime: now,
          countdown,
          burst:
            missLane >= 0
              ? {
                  lane: missLane,
                  judge: "miss" as const,
                  id: burstIdRef.current,
                }
              : stateRef.current.burst,
        };
        stateRef.current = next;
        setState(next);
      } else {
        setState((prev) => ({ ...prev, songTime: now, countdown }));
      }

      // Pull empty-streak kills from applyHit
      livesAfter = Math.min(livesAfter, stateRef.current.lives);

      const songDone =
        now >= durationRef.current + 0.4 ||
        (audioStarted && !!audio?.ended);

      if ((livesAfter <= 0 || songDone) && now >= 0) {
        finishRun(livesAfter);
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [state.phase, finishRun]);

  useEffect(() => () => cleanupSong(), [cleanupSong]);

  useEffect(() => {
    if (state.phase !== "playing") return;
    const down = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in KEY_TO_LANE)) return;
      if (e.repeat || down.has(k)) return;
      down.add(k);
      e.preventDefault();
      applyHit(KEY_TO_LANE[k]!);
    };
    const onUp = (e: KeyboardEvent) => {
      down.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [state.phase, applyHit]);

  const visibleNotes = (): ActiveNote[] => {
    const now = state.songTime;
    return notesRef.current.filter((n) => {
      if (n.resolved && n.result === "miss") return now - n.t < 0.2;
      if (n.resolved) return false;
      return n.t - now < APPROACH_S + 0.05 && n.t - now > -WINDOW_GOOD;
    });
  };

  return {
    state,
    song: songRef.current,
    artUrl: state.artUrl,
    noteCount: state.noteCount,
    search,
    setQuery,
    pickSong,
    start,
    restart,
    backToBrowse,
    applyHit,
    visibleNotes,
    approach: APPROACH_S,
    maxLives: HERO_LIVES,
  };
}
