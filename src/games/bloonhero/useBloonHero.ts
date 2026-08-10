import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import {
  CASH_PER_GOOD,
  CASH_PER_GREAT,
  CASH_PER_PERFECT,
  EMPTY_STREAK_PER_LIFE,
  HERO_BONUS_RATIO,
  HERO_CLEAR_BONUS,
  HERO_GOOD_BONUS,
  HERO_LIVES,
  KEY_TO_LANE,
  WINDOW_GOOD,
  judgeOffset,
  leadInSeconds,
  type Judge,
} from "./config";
import { drawHeroHighway } from "./drawHighway";
import { downloadSng, searchEnchor, type EnchorHit } from "./enchorApi";
import type { PlayableInstrument } from "./instruments";
import { loadSongFromSng, revokeLoadedSong, type LoadedSong } from "./loadSng";
import type { ChartNote } from "./parseChartFile";

export type ActiveNote = ChartNote & {
  id: number;
  resolved: boolean;
  result?: Judge;
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
  /** Finished the song with strong accuracy → bonus pack. */
  didWell: boolean;
  countdown: string | null;
  burst: { lane: number; judge: Judge; id: number } | null;
  emptyStreak: number;
  title: string;
  artist: string;
  artUrl: string | null;
  noteCount: number;
  duration: number;
  /** Sparse UI clock — not used for note motion. */
  songTime: number;
  volume: number;
  instrument: PlayableInstrument | null;
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
  didWell: false,
  countdown: null,
  burst: null,
  emptyStreak: 0,
  title: "",
  artist: "",
  artUrl: null,
  noteCount: 0,
  duration: 0,
  songTime: 0,
  volume: DEFAULT_VOLUME,
  instrument: null,
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
  /** Last chart note time — not used alone to end the run. */
  const chartEndRef = useRef(0);
  const leadInRef = useRef(leadInSeconds(120));
  const originRef = useRef(0);
  const frameRef = useRef(0);
  const pendingCashRef = useRef(0);
  const attemptedRef = useRef(0);
  const hitsRef = useRef(0);
  const burstIdRef = useRef(0);
  const songTimeRef = useRef(0);
  const keysDownRef = useRef(new Set<number>());
  const pressedRef = useRef(new Set<number>());
  const holdingRef = useRef(new Set<number>());
  const pressClearTimers = useRef<Record<number, number>>({});
  const progressFillRef = useRef<HTMLElement | null>(null);
  const countdownElRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const canvasCssRef = useRef({ w: 0, h: 0, dpr: 1 });
  const scanFromRef = useRef(0);
  const lastCountdownRef = useRef<string | null>(null);
  const endedRef = useRef(false);
  const missHudAccumRef = useRef({ count: 0, lane: -1, at: 0 });
  /** Smoothed audio clock (audio.currentTime is chunky). */
  const clockRef = useRef({
    baseAudio: 0,
    baseWall: 0,
    lastAudioSample: -1,
  });

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

  const setProgressFillEl = useCallback((el: HTMLElement | null) => {
    progressFillRef.current = el;
  }, []);

  const setCountdownEl = useCallback((el: HTMLElement | null) => {
    countdownElRef.current = el;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    canvasCssRef.current = { w, h, dpr };
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d", { alpha: true });
    canvasCtxRef.current = ctx;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const setCanvasEl = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      if (el) {
        requestAnimationFrame(() => resizeCanvas());
      } else {
        canvasCtxRef.current = null;
      }
    },
    [resizeCanvas],
  );

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
            ? "No charts with both Guitar and Vocals found."
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
        const chartEnd = loaded.chart.duration;
        chartEndRef.current = chartEnd;
        const refreshAudioLength = () => {
          const fromAudio =
            Number.isFinite(audio.duration) && audio.duration > 0
              ? audio.duration
              : 0;
          const fromMeta = (hit.song_length || 0) / 1000;
          // Prefer real audio length so we don't end at the last chart note.
          durationRef.current = Math.max(fromAudio, fromMeta, chartEnd);
          setState((prev) =>
            prev.phase === "ready" || prev.phase === "playing"
              ? { ...prev, duration: durationRef.current }
              : prev,
          );
        };
        refreshAudioLength();
        audio.addEventListener("loadedmetadata", refreshAudioLength);
        audio.addEventListener("durationchange", refreshAudioLength);
        setState((prev) => ({
          ...prev,
          phase: "ready",
          title: loaded.chart.name || hit.name,
          artist: loaded.chart.artist || hit.artist,
          artUrl: loaded.artUrl,
          noteCount: loaded.chart.notes.length,
          duration: durationRef.current,
          instrument: null,
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
    try {
      const chart = song.setInstrument(instrument);
      chartEndRef.current = chart.duration;
      const fromAudio =
        Number.isFinite(audioRef.current?.duration) &&
        (audioRef.current?.duration ?? 0) > 0
          ? (audioRef.current?.duration ?? 0)
          : 0;
      durationRef.current = Math.max(
        fromAudio,
        durationRef.current,
        chart.duration,
      );
      setState((prev) => ({
        ...prev,
        instrument: chart.instrument,
        noteCount: chart.notes.length,
        duration: durationRef.current,
        error: null,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : "Could not switch instrument",
      }));
    }
  }, []);

  const flashPress = useCallback((lane: number) => {
    pressedRef.current.add(lane);
    if (pressClearTimers.current[lane]) {
      window.clearTimeout(pressClearTimers.current[lane]);
    }
    pressClearTimers.current[lane] = window.setTimeout(() => {
      if (!keysDownRef.current.has(lane) && !holdingRef.current.has(lane)) {
        pressedRef.current.delete(lane);
      }
    }, 90);
  }, []);

  const rebuildHolding = useCallback(() => {
    const next = new Set<number>();
    for (const n of notesRef.current) {
      if (n.holding && !n.releasedEarly) next.add(n.lane);
    }
    holdingRef.current = next;
  }, []);

  const songTimeNow = useCallback(() => songTimeRef.current, []);

  const finishRun = useCallback((opts: { died: boolean }) => {
    if (endedRef.current) return;
    endedRef.current = true;
    cancelAnimationFrame(frameRef.current);
    // Flush any throttled miss HUD into the final totals.
    if (missHudAccumRef.current.count > 0) {
      stateRef.current = {
        ...stateRef.current,
        miss: stateRef.current.miss + missHudAccumRef.current.count,
      };
      missHudAccumRef.current.count = 0;
    }
    const attempted = Math.max(1, attemptedRef.current);
    const ratio = hitsRef.current / attempted;
    // Clear = survived to the end of the song. Misses never fail you.
    const cleared = !opts.died;
    const didWell = cleared && ratio >= HERO_BONUS_RATIO;
    setState((prev) => ({
      ...prev,
      phase: "results",
      lives: opts.died ? 0 : prev.lives,
      miss: stateRef.current.miss,
      cleared,
      didWell,
      countdown: null,
      songTime: songTimeRef.current,
    }));
    if (audioRef.current) audioRef.current.pause();
    void (async () => {
      let grant = pendingCashRef.current;
      pendingCashRef.current = 0;
      if (cleared) {
        grant += HERO_CLEAR_BONUS;
        if (didWell) grant += HERO_GOOD_BONUS;
        setState((prev) =>
          prev.phase === "results"
            ? {
                ...prev,
                cashEarned:
                  prev.cashEarned +
                  HERO_CLEAR_BONUS +
                  (didWell ? HERO_GOOD_BONUS : 0),
              }
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
    if (!stateRef.current.instrument) {
      setState((prev) => ({
        ...prev,
        error: "Pick Guitar or Vocals first",
      }));
      return;
    }
    // Ensure chart matches selection
    if (song.chart.instrument !== stateRef.current.instrument) {
      song.setInstrument(stateRef.current.instrument);
    }
    pendingCashRef.current = 0;
    attemptedRef.current = 0;
    hitsRef.current = 0;
    scanFromRef.current = 0;
    endedRef.current = false;
    missHudAccumRef.current = { count: 0, lane: -1, at: 0 };
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
    clockRef.current = { baseAudio: 0, baseWall: 0, lastAudioSample: -1 };
    keysDownRef.current.clear();
    pressedRef.current.clear();
    holdingRef.current.clear();
    audio.pause();
    audio.currentTime = 0;
    resizeCanvas();
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
  }, [resizeCanvas]);

  const backToBrowse = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    cleanupSong();
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
      pressedRef.current.delete(lane);
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
      if (changed) rebuildHolding();
    },
    [rebuildHolding],
  );

  const applyHit = useCallback(
    (lane: number) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      keysDownRef.current.add(lane);
      flashPress(lane);
      const now = songTimeNow();
      if (now < 0) return;

      for (const n of notesRef.current) {
        if (n.holding && n.lane === lane && !n.releasedEarly) return;
      }

      let best: ActiveNote | null = null;
      let bestAbs = Infinity;
      // Only scan a window around the playhead
      const from = Math.max(0, scanFromRef.current - 4);
      for (let i = from; i < notesRef.current.length; i++) {
        const n = notesRef.current[i]!;
        if (n.t - now > WINDOW_GOOD) break;
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
        // Only consecutive spam burns strikes — regular misses do not.
        if (
          streak > 0 &&
          streak % EMPTY_STREAK_PER_LIFE === 0
        ) {
          lives = Math.max(0, lives - 1);
        }
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
        if (lives <= 0) {
          finishRun({ died: true });
        }
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
      if (best.sustain) holdingRef.current.add(lane);
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
    [flashPress, flushCash, songTimeNow, finishRun],
  );

  // Playback + canvas draw loop
  useEffect(() => {
    if (state.phase !== "playing") {
      cancelAnimationFrame(frameRef.current);
      return;
    }

    let audioStarted = false;
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);

    const tick = () => {
      if (endedRef.current) return;
      const leadIn = leadInRef.current;
      const wallMs = performance.now();
      const wall = (wallMs - originRef.current) / 1000;
      let now = wall - leadIn;

      const audio = audioRef.current;
      if (!audioStarted && now >= 0 && audio) {
        audioStarted = true;
        audio.currentTime = 0;
        clockRef.current = {
          baseAudio: 0,
          baseWall: wallMs / 1000,
          lastAudioSample: 0,
        };
        void audio.play().catch(() => {});
      }

      if (audioStarted && audio && !audio.paused) {
        const delay = (songRef.current?.delayMs || 0) / 1000;
        const sample = audio.currentTime - delay;
        const clock = clockRef.current;
        const wallSec = wallMs / 1000;
        // Resync when the media clock advances; only nudge a few frames ahead
        // so a stalled / coarse currentTime can't race past the real song.
        if (sample !== clock.lastAudioSample) {
          clock.lastAudioSample = sample;
          clock.baseAudio = sample;
          clock.baseWall = wallSec;
          now = sample;
        } else {
          const ahead = Math.min(0.05, Math.max(0, wallSec - clock.baseWall));
          now = clock.baseAudio + ahead;
        }
      }
      songTimeRef.current = now;

      // Keep duration synced if browser learns audio length late (common for opus).
      if (
        audio &&
        Number.isFinite(audio.duration) &&
        audio.duration > durationRef.current + 0.25
      ) {
        durationRef.current = audio.duration;
      }

      const fill = progressFillRef.current;
      if (fill) {
        const p = Math.min(
          100,
          Math.max(
            0,
            (Math.max(0, now) / Math.max(1, durationRef.current)) * 100,
          ),
        );
        fill.style.transform = `scaleX(${p / 100})`;
      }

      let holdsChanged = false;
      for (const n of notesRef.current) {
        if (!n.holding || n.releasedEarly) continue;
        if (now >= n.t + n.dur) {
          n.holding = false;
          holdsChanged = true;
        }
      }
      if (holdsChanged) rebuildHolding();

      // Advance miss scanner
      // Missed notes: score only — they do not drain lives.
      let missed = 0;
      let missLane = -1;
      let i = scanFromRef.current;
      const notes = notesRef.current;
      while (i < notes.length) {
        const n = notes[i]!;
        if (!n.resolved && now - n.t > WINDOW_GOOD) {
          n.resolved = true;
          n.result = "miss";
          missed += 1;
          missLane = n.lane;
          attemptedRef.current += 1;
          i += 1;
          continue;
        }
        if (n.resolved && !n.holding) {
          i += 1;
          scanFromRef.current = i;
          continue;
        }
        break;
      }

      const ctx = canvasCtxRef.current;
      const { w, h } = canvasCssRef.current;
      if (ctx && w > 0 && h > 0) {
        scanFromRef.current = drawHeroHighway(ctx, w, h, {
          now,
          notes,
          scanFrom: scanFromRef.current,
          pressed: pressedRef.current,
          holding: holdingRef.current,
        });
      }

      const countdown = countdownFromSongTime(now, 120);
      if (countdown !== lastCountdownRef.current) {
        lastCountdownRef.current = countdown;
        setState((prev) => ({ ...prev, countdown, songTime: now }));
      }
      const cdEl = countdownElRef.current;
      if (cdEl) {
        cdEl.hidden = !countdown;
        const span = cdEl.querySelector("span");
        if (span && countdown) span.textContent = countdown;
      }

      if (missed > 0) {
        const hud = missHudAccumRef.current;
        hud.count += missed;
        hud.lane = missLane;
        // Dense charts miss many notes/frame — don't React-reconcile each one.
        if (wallMs - hud.at > 80) {
          hud.at = wallMs;
          const add = hud.count;
          hud.count = 0;
          burstIdRef.current += 1;
          const next = {
            ...stateRef.current,
            miss: stateRef.current.miss + add,
            combo: 0,
            lastJudge: "miss" as const,
            burst:
              hud.lane >= 0
                ? {
                    lane: hud.lane,
                    judge: "miss" as const,
                    id: burstIdRef.current,
                  }
                : stateRef.current.burst,
          };
          stateRef.current = next;
          setState(next);
        }
      } else if (missHudAccumRef.current.count > 0 && wallMs - missHudAccumRef.current.at > 80) {
        const hud = missHudAccumRef.current;
        const add = hud.count;
        hud.count = 0;
        hud.at = wallMs;
        burstIdRef.current += 1;
        const next = {
          ...stateRef.current,
          miss: stateRef.current.miss + add,
          combo: 0,
          lastJudge: "miss" as const,
          burst:
            hud.lane >= 0
              ? {
                  lane: hud.lane,
                  judge: "miss" as const,
                  id: burstIdRef.current,
                }
              : stateRef.current.burst,
        };
        stateRef.current = next;
        setState(next);
      }

      const livesAfter = stateRef.current.lives;
      // End when the packed audio finishes. Never cut on last-chart-note or a
      // half-reported opus duration while Encore/ini says the track is longer.
      const declaredLen = Math.max(durationRef.current, chartEndRef.current);
      const reportedLen =
        audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 0;
      const audioPos = audio?.currentTime ?? 0;
      const trustReported =
        reportedLen > 1 && reportedLen >= Math.max(1, declaredLen) * 0.9;
      const songDone =
        audioStarted &&
        !!audio &&
        (audio.ended ||
          (trustReported && audioPos >= reportedLen - 0.12));

      if (livesAfter <= 0 && now >= 0) {
        finishRun({ died: true });
        return;
      }
      if (songDone && now >= 0) {
        finishRun({ died: false });
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [state.phase, finishRun, rebuildHolding, resizeCanvas]);

  useEffect(() => () => cleanupSong(), [cleanupSong]);

  useEffect(() => {
    if (state.phase !== "playing" && state.phase !== "ready") return;
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    // draw a static preview on ready
    if (state.phase === "ready") {
      resizeCanvas();
      const ctx = canvasCtxRef.current;
      const { w, h } = canvasCssRef.current;
      if (ctx && w > 0 && h > 0) {
        drawHeroHighway(ctx, w, h, {
          now: 0,
          notes: [],
          scanFrom: 0,
          pressed: new Set(),
          holding: new Set(),
        });
      }
    }
    return () => window.removeEventListener("resize", onResize);
  }, [state.phase, resizeCanvas]);

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
    maxLives: HERO_LIVES,
    setCanvasEl,
    setProgressFillEl,
    setCountdownEl,
  };
}
