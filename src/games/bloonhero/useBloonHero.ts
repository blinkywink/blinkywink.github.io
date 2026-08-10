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
  noteY,
  type Judge,
} from "./config";
import { downloadSng, searchEnchor, type EnchorHit } from "./enchorApi";
import type { PlayableInstrument } from "./instruments";
import { loadSongFromSng, revokeLoadedSong, type LoadedSong } from "./loadSng";
import type { ChartNote } from "./parseChartFile";

export type ActiveNote = ChartNote & {
  id: number;
  resolved: boolean;
  result?: Judge;
  /** Sustain head was hit; key should stay down. */
  holding: boolean;
  releasedEarly: boolean;
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
  holdingLanes: number[];
  burst: { lane: number; judge: Judge; id: number } | null;
  emptyStreak: number;
  title: string;
  artist: string;
  artUrl: string | null;
  noteCount: number;
  duration: number;
  /** Sparse UI clock — do not drive note motion from this. */
  songTime: number;
  /** 0–1, game-local (not master SFX). */
  volume: number;
  instrument: PlayableInstrument;
  availableInstruments: PlayableInstrument[];
};

const VOLUME_KEY = "bloonhero-volume";
const DEFAULT_VOLUME = 0.5;

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, n));
  } catch {
    return DEFAULT_VOLUME;
  }
}

const INITIAL: HeroState = {
  phase: "browse",
  query: "",
  results: [],
  searching: false,
  error: null,
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
  holdingLanes: [],
  burst: null,
  emptyStreak: 0,
  title: "",
  artist: "",
  artUrl: null,
  noteCount: 0,
  duration: 0,
  songTime: 0,
  volume: DEFAULT_VOLUME,
  instrument: "guitar",
  availableInstruments: [],
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

function noteEnd(n: ChartNote): number {
  return n.t + (n.sustain ? n.dur : 0);
}

function computeVisible(notes: ActiveNote[], now: number): ActiveNote[] {
  const out: ActiveNote[] = [];
  for (const n of notes) {
    const end = noteEnd(n);
    if (n.resolved && n.result === "miss") {
      if (now - n.t < 0.18) out.push(n);
      continue;
    }
    if (n.resolved && n.sustain && (n.holding || now < end + 0.05)) {
      if (now < end + 0.12 && !n.releasedEarly) out.push(n);
      continue;
    }
    if (n.resolved) continue;
    if (n.t - now < APPROACH_S + 0.08 && end - now > -WINDOW_GOOD) out.push(n);
  }
  return out;
}

export function useBloonHero() {
  const { setCoinBalance } = useAuth();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;

  const [state, setState] = useState<HeroState>(() => ({
    ...INITIAL,
    volume: readStoredVolume(),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const volumeRef = useRef(state.volume);
  volumeRef.current = state.volume;

  const songRef = useRef<LoadedSong | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const notesRef = useRef<ActiveNote[]>([]);
  const durationRef = useRef(0);
  const leadInRef = useRef(leadInSeconds(120));
  const originRef = useRef(0);
  const frameRef = useRef(0);
  const pendingCashRef = useRef(0);
  const attemptedRef = useRef(0);
  const hitsRef = useRef(0);
  const burstIdRef = useRef(0);
  const pressTimers = useRef<Record<number, number>>({});
  const songTimeRef = useRef(0);
  const keysDownRef = useRef(new Set<number>());
  const boardRef = useRef<HTMLElement | null>(null);
  const progressFillRef = useRef<HTMLElement | null>(null);
  const noteElsRef = useRef(new Map<number, HTMLElement>());
  const visibleRef = useRef<ActiveNote[]>([]);
  const [visibleNotes, setVisibleNotes] = useState<ActiveNote[]>([]);
  const lastCountdownRef = useRef<string | null>(null);
  const lastUiSongTimeRef = useRef(-999);

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

  const setBoardEl = useCallback((el: HTMLElement | null) => {
    boardRef.current = el;
  }, []);

  const setProgressFillEl = useCallback((el: HTMLElement | null) => {
    progressFillRef.current = el;
  }, []);

  const setNoteEl = useCallback((id: number, el: HTMLElement | null) => {
    if (el) noteElsRef.current.set(id, el);
    else noteElsRef.current.delete(id);
  }, []);

  const setQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, query }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const v = Math.min(1, Math.max(0, volume));
    volumeRef.current = v;
    if (audioRef.current) audioRef.current.volume = v;
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      /* ignore */
    }
    setState((prev) => (prev.volume === v ? prev : { ...prev, volume: v }));
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
        error:
          res.data.length === 0
            ? "No playable guitar Expert charts found."
            : null,
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
        audio.volume = volumeRef.current;
        await audio.load();
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
          instrument: loaded.chart.instrument,
          availableInstruments: loaded.availableInstruments,
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

  const setInstrument = useCallback((instrument: PlayableInstrument) => {
    const song = songRef.current;
    if (!song || stateRef.current.phase !== "ready") return;
    if (!song.availableInstruments.includes(instrument)) return;
    if (song.chart.instrument === instrument) return;
    try {
      const chart = song.setInstrument(instrument);
      durationRef.current = Math.max(
        chart.duration,
        Number.isFinite(audioRef.current?.duration)
          ? (audioRef.current?.duration ?? 0)
          : 0,
        durationRef.current,
      );
      setState((prev) => ({
        ...prev,
        instrument: chart.instrument,
        noteCount: chart.notes.length,
        duration: durationRef.current,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : "Could not switch instrument",
      }));
    }
  }, []);

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
      if (keysDownRef.current.has(lane)) return;
      setState((prev) => ({
        ...prev,
        pressed: prev.pressed.filter((l) => l !== lane),
      }));
    }, 110);
  }, []);

  const syncHoldingLanes = useCallback(() => {
    const lanes: number[] = [];
    for (const n of notesRef.current) {
      if (n.holding && !n.releasedEarly) lanes.push(n.lane);
    }
    setState((prev) => {
      const same =
        prev.holdingLanes.length === lanes.length &&
        prev.holdingLanes.every((l, i) => l === lanes[i]);
      return same ? prev : { ...prev, holdingLanes: lanes };
    });
  }, []);

  const songTimeNow = useCallback(() => {
    const audio = audioRef.current;
    const song = songRef.current;
    if (!audio || !song) return songTimeRef.current;
    if (audio.paused && stateRef.current.phase === "playing") {
      const wall = (performance.now() - originRef.current) / 1000;
      return wall - leadInRef.current;
    }
    const delay = (song.delayMs || 0) / 1000;
    return audio.currentTime - delay;
  }, []);

  const finishRun = useCallback((livesAfter: number) => {
    const attempted = Math.max(1, attemptedRef.current);
    const ratio = hitsRef.current / attempted;
    const cleared = ratio >= HERO_CLEAR_RATIO;
    setState((prev) => ({
      ...prev,
      phase: "results",
      lives: livesAfter,
      cleared,
      countdown: null,
      songTime: songTimeRef.current,
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
  }, []);

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
      holding: false,
      releasedEarly: false,
    }));
    leadInRef.current = leadInSeconds(120);
    originRef.current = performance.now();
    songTimeRef.current = -leadInRef.current;
    lastCountdownRef.current = "4";
    lastUiSongTimeRef.current = -999;
    visibleRef.current = [];
    setVisibleNotes([]);
    noteElsRef.current.clear();
    keysDownRef.current.clear();
    audio.pause();
    audio.currentTime = 0;
    setState((prev) => ({
      ...INITIAL,
      phase: "playing",
      query: prev.query,
      results: prev.results,
      title: prev.title,
      artist: prev.artist,
      artUrl: prev.artUrl,
      noteCount: prev.noteCount,
      duration: durationRef.current,
      volume: prev.volume,
      instrument: prev.instrument,
      availableInstruments: prev.availableInstruments,
      songTime: -leadInRef.current,
      countdown: "4",
      lives: HERO_LIVES,
    }));
  }, []);

  const backToBrowse = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    cleanupSong();
    setVisibleNotes([]);
    setState((prev) => ({
      ...INITIAL,
      query: prev.query,
      results: prev.results,
      volume: prev.volume,
      phase: "browse",
    }));
  }, [cleanupSong]);

  const restart = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setVisibleNotes([]);
    setState((prev) => ({
      ...INITIAL,
      phase: "ready",
      query: prev.query,
      results: prev.results,
      title: prev.title,
      artist: prev.artist,
      artUrl: prev.artUrl,
      noteCount: prev.noteCount,
      duration: prev.duration,
      volume: prev.volume,
      instrument: prev.instrument,
      availableInstruments: prev.availableInstruments,
    }));
  }, []);

  const releaseLane = useCallback(
    (lane: number) => {
      keysDownRef.current.delete(lane);
      let changed = false;
      for (const n of notesRef.current) {
        if (!n.holding || n.lane !== lane || n.releasedEarly) continue;
        const now = songTimeRef.current;
        if (now < n.t + n.dur - 0.08) {
          n.releasedEarly = true;
          n.holding = false;
          changed = true;
          setState((prev) => ({
            ...prev,
            combo: 0,
            lastJudge: "miss",
            emptyStreak: 0,
          }));
        } else {
          n.holding = false;
          changed = true;
        }
      }
      if (changed) syncHoldingLanes();
      setState((prev) => ({
        ...prev,
        pressed: prev.pressed.filter((l) => l !== lane),
      }));
    },
    [syncHoldingLanes],
  );

  const applyHit = useCallback(
    (lane: number) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      keysDownRef.current.add(lane);
      flashPress(lane);
      const now = songTimeNow();
      if (now < 0) return;

      // Already holding this lane's sustain
      for (const n of notesRef.current) {
        if (n.holding && n.lane === lane && !n.releasedEarly) return;
      }

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
      best.holding = best.sustain;
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
          holdingLanes: best!.sustain
            ? prev.holdingLanes.includes(lane)
              ? prev.holdingLanes
              : [...prev.holdingLanes, lane]
            : prev.holdingLanes,
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

  // Playback clock — avoids setState every frame (was the main lag source).
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
        void audio.play().catch(() => {});
      }
      if (audioStarted && audio && !audio.paused) {
        const delay = (songRef.current?.delayMs || 0) / 1000;
        now = audio.currentTime - delay;
      }
      songTimeRef.current = now;

      const board = boardRef.current;
      if (board) {
        board.style.setProperty("--now", String(now));
        board.style.setProperty("--scroll", `${Math.max(0, now) * 168}px`);
      }
      const fill = progressFillRef.current;
      if (fill) {
        const p = Math.min(
          100,
          Math.max(0, (Math.max(0, now) / Math.max(1, durationRef.current)) * 100),
        );
        fill.style.width = `${p}%`;
      }

      // Direct DOM note positions
      for (const n of visibleRef.current) {
        const el = noteElsRef.current.get(n.id);
        if (!el) continue;
        const head = el.querySelector<HTMLElement>(".hero-note__key");
        const trail = el.querySelector<HTMLElement>(".hero-note__trail");
        const yHead = noteY(now, n.t);
        if (head) head.style.top = `${yHead}%`;
        if (trail && n.sustain) {
          const yEnd = noteY(now, n.t + n.dur);
          const top = Math.min(yHead, yEnd);
          const height = Math.max(0, Math.abs(yEnd - yHead));
          trail.style.top = `${top}%`;
          trail.style.height = `${height}%`;
          trail.classList.toggle("is-holding", n.holding && !n.releasedEarly);
          trail.classList.toggle("is-dropped", n.releasedEarly);
        }
        el.classList.toggle("is-holding", n.holding && !n.releasedEarly);
      }

      // Finish completed holds
      let holdsChanged = false;
      for (const n of notesRef.current) {
        if (!n.holding || n.releasedEarly) continue;
        if (now >= n.t + n.dur) {
          n.holding = false;
          holdsChanged = true;
        }
      }
      if (holdsChanged) syncHoldingLanes();

      const nextVisible = computeVisible(notesRef.current, now);
      const prevIds = visibleRef.current;
      let changed =
        prevIds.length !== nextVisible.length ||
        prevIds.some((n, i) => n.id !== nextVisible[i]!.id);
      if (changed) {
        visibleRef.current = nextVisible;
        setVisibleNotes(nextVisible);
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
        lastCountdownRef.current = countdown;
      } else if (countdown !== lastCountdownRef.current) {
        lastCountdownRef.current = countdown;
        setState((prev) => ({ ...prev, countdown }));
      } else if (Math.abs(now - lastUiSongTimeRef.current) > 0.25) {
        // Low-rate hint / countdown-adjacent UI only
        lastUiSongTimeRef.current = now;
        setState((prev) => ({ ...prev, songTime: now }));
      }

      livesAfter = Math.min(livesAfter, stateRef.current.lives);
      const songDone =
        now >= durationRef.current + 0.4 || (audioStarted && !!audio?.ended);

      if ((livesAfter <= 0 || songDone) && now >= 0) {
        finishRun(livesAfter);
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [state.phase, finishRun, syncHoldingLanes]);

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
      const k = e.key.toLowerCase();
      down.delete(k);
      if (k in KEY_TO_LANE) releaseLane(KEY_TO_LANE[k]!);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [state.phase, applyHit, releaseLane]);

  return {
    state,
    artUrl: state.artUrl,
    noteCount: state.noteCount,
    search,
    setQuery,
    setVolume,
    pickSong,
    setInstrument,
    start,
    restart,
    backToBrowse,
    applyHit,
    releaseLane,
    visibleNotes,
    approach: APPROACH_S,
    maxLives: HERO_LIVES,
    setBoardEl,
    setProgressFillEl,
    setNoteEl,
    songTimeRef,
  };
}
