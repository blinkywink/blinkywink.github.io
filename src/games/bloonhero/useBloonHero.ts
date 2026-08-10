import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { HeroAudio } from "./audioEngine";
import {
  APPROACH_S,
  CASH_PER_GOOD,
  CASH_PER_GREAT,
  CASH_PER_PERFECT,
  CHART,
  HERO_CLEAR_BONUS,
  HERO_CLEAR_RATIO,
  HIT_LINE_Y,
  SPAWN_Y,
  judgeOffsetAt,
  leadInSeconds,
  scaledWindows,
  type Judge,
} from "./config";
import {
  DIFFICULTY_META,
  thinChart,
  type Difficulty,
} from "./difficulty";

export type ChartNote = (typeof CHART.notes)[number];

export type ActiveNote = ChartNote & {
  id: number;
  resolved: boolean;
  result?: Judge;
};

export type HeroPhase = "ready" | "playing" | "results";

export type HeroState = {
  phase: HeroPhase;
  difficulty: Difficulty;
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
  /** Visual countdown during lead-in: "4"|"3"|"2"|"1"|"GO"|null */
  countdown: string | null;
};

const INITIAL: HeroState = {
  phase: "ready",
  difficulty: "easy",
  songTime: 0,
  combo: 0,
  maxCombo: 0,
  perfect: 0,
  great: 0,
  good: 0,
  miss: 0,
  lives: DIFFICULTY_META.easy.lives,
  cashEarned: 0,
  lastJudge: null,
  cleared: false,
  countdown: null,
};

function countdownFromSongTime(songTime: number, bpm: number): string | null {
  if (songTime >= 0.4) return null;
  const beat = 60 / bpm;
  if (songTime >= 0) return "GO";
  const beatIndex = Math.floor(songTime / beat);
  const n = -beatIndex;
  if (n < 1 || n > 8) return null;
  return String(n);
}

function noteY(songTime: number, noteT: number, approach: number): number {
  const u = (noteT - songTime) / approach;
  const clamped = Math.min(1, Math.max(0, u));
  return SPAWN_Y + (1 - clamped) * (HIT_LINE_Y - SPAWN_Y);
}

const KEY_TO_LANE: Record<string, number> = {
  d: 0,
  f: 1,
  j: 2,
  k: 3,
};

function cashFor(j: Judge, mul: number): number {
  const base =
    j === "perfect"
      ? CASH_PER_PERFECT
      : j === "great"
        ? CASH_PER_GREAT
        : j === "good"
          ? CASH_PER_GOOD
          : 0;
  return Math.round(base * mul);
}

export function useBloonHero() {
  const { setCoinBalance } = useAuth();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;

  const [state, setState] = useState<HeroState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const audioRef = useRef(new HeroAudio());
  const notesRef = useRef<ActiveNote[]>([]);
  const chartLenRef = useRef(0);
  const windowsRef = useRef(scaledWindows(DIFFICULTY_META.easy.windowScale));
  const frameRef = useRef(0);
  const pendingCashRef = useRef(0);
  const awardedRef = useRef(false);

  const noteCounts = useMemo(
    () => ({
      easy: thinChart(CHART.notes, "easy").length,
      normal: thinChart(CHART.notes, "normal").length,
      hard: thinChart(CHART.notes, "hard").length,
    }),
    [],
  );

  const flushCash = useCallback(async () => {
    const amount = pendingCashRef.current;
    if (amount <= 0) return;
    pendingCashRef.current = 0;
    const balance = await awardCoins(amount);
    if (balance != null) setCoinBalanceRef.current(balance);
  }, []);

  const setDifficulty = useCallback((difficulty: Difficulty) => {
    setState((prev) =>
      prev.phase === "ready"
        ? {
            ...prev,
            difficulty,
            lives: DIFFICULTY_META[difficulty].lives,
          }
        : prev,
    );
  }, []);

  const start = useCallback(() => {
    const diff = stateRef.current.difficulty;
    const meta = DIFFICULTY_META[diff];
    const playable = thinChart(CHART.notes, diff);
    const leadIn = leadInSeconds(CHART.bpm);
    awardedRef.current = false;
    pendingCashRef.current = 0;
    chartLenRef.current = playable.length;
    windowsRef.current = scaledWindows(meta.windowScale);
    notesRef.current = playable.map((n, i) => ({
      ...n,
      id: i,
      resolved: false,
    }));
    const audio = audioRef.current;
    audio.ensure();
    audio.beginSong(leadIn);
    audio.scheduleAccompaniment(CHART.accompaniment);
    audio.startDrums(CHART.bpm);
    setState({
      ...INITIAL,
      phase: "playing",
      difficulty: diff,
      lives: meta.lives,
      songTime: -leadIn,
      countdown: countdownFromSongTime(-leadIn, CHART.bpm),
    });
  }, []);

  const restart = useCallback(() => {
    audioRef.current.stopAll();
    audioRef.current = new HeroAudio();
    cancelAnimationFrame(frameRef.current);
    const diff = stateRef.current.difficulty;
    setState({
      ...INITIAL,
      difficulty: diff,
      lives: DIFFICULTY_META[diff].lives,
    });
    notesRef.current = [];
    awardedRef.current = false;
    pendingCashRef.current = 0;
  }, []);

  const applyHit = useCallback(
    (lane: number) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const now = audioRef.current.songTime();
      const goodWin = windowsRef.current.good;
      let best: ActiveNote | null = null;
      let bestAbs = Infinity;
      for (const n of notesRef.current) {
        if (n.resolved || n.lane !== lane) continue;
        const dt = now - n.t;
        const a = Math.abs(dt);
        if (a > goodWin) continue;
        if (a < bestAbs) {
          bestAbs = a;
          best = n;
        }
      }
      if (!best) return;

      const dt = now - best.t;
      const judge = judgeOffsetAt(dt, windowsRef.current);
      if (!judge) return;

      best.resolved = true;
      best.result = judge;
      audioRef.current.playHitNote(best.midi, best.dur, best.vel, judge);

      const mul = DIFFICULTY_META[s.difficulty].cashMul;
      const pay = cashFor(judge, mul);
      pendingCashRef.current += pay;

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
        };
      });

      if (pendingCashRef.current >= 40) void flushCash();
    },
    [flushCash],
  );

  useEffect(() => {
    if (state.phase !== "playing") {
      cancelAnimationFrame(frameRef.current);
      return;
    }

    const tick = () => {
      const now = audioRef.current.songTime();
      const goodWin = windowsRef.current.good;
      const countdown = countdownFromSongTime(now, CHART.bpm);
      let missed = 0;
      for (const n of notesRef.current) {
        if (n.resolved) continue;
        if (now - n.t > goodWin) {
          n.resolved = true;
          n.result = "miss";
          missed += 1;
        }
      }

      let livesAfter = stateRef.current.lives;
      if (missed > 0) {
        livesAfter = Math.max(0, livesAfter - missed);
        const next = {
          ...stateRef.current,
          miss: stateRef.current.miss + missed,
          combo: 0,
          lives: livesAfter,
          lastJudge: "miss" as const,
          songTime: now,
          countdown,
        };
        stateRef.current = next;
        setState(next);
      } else {
        setState((prev) => ({ ...prev, songTime: now, countdown }));
      }

      const total = chartLenRef.current;
      const resolved = notesRef.current.filter((n) => n.resolved).length;
      const songDone = now >= CHART.duration || (total > 0 && resolved >= total);
      const dead = livesAfter <= 0;

      if ((dead || songDone) && now >= 0) {
        const hitCount = notesRef.current.filter(
          (n) => n.result && n.result !== "miss",
        ).length;
        const ratio = hitCount / Math.max(1, total);
        const cleared = ratio >= HERO_CLEAR_RATIO;
        const bonusMul =
          DIFFICULTY_META[stateRef.current.difficulty].clearBonusMul;

        setState((prev) => ({
          ...prev,
          phase: "results",
          songTime: now,
          cleared,
          lives: livesAfter,
        }));

        void (async () => {
          let grant = pendingCashRef.current;
          pendingCashRef.current = 0;
          if (cleared) {
            const bonus = Math.round(HERO_CLEAR_BONUS * bonusMul);
            grant += bonus;
            setState((prev) =>
              prev.phase === "results"
                ? { ...prev, cashEarned: prev.cashEarned + bonus }
                : prev,
            );
          }
          if (grant > 0) {
            const balance = await awardCoins(grant);
            if (balance != null) setCoinBalanceRef.current(balance);
          }
        })();

        audioRef.current.stopAll();
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [state.phase]);

  useEffect(() => () => audioRef.current.stopAll(), []);

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
    const now =
      state.phase === "playing" ? audioRef.current.songTime() : state.songTime;
    const goodWin = windowsRef.current.good;
    return notesRef.current.filter((n) => {
      if (n.resolved && n.result === "miss") {
        return now - n.t < 0.2;
      }
      if (n.resolved) return false;
      return n.t - now < APPROACH_S + 0.05 && n.t - now > -goodWin;
    });
  };

  return {
    state,
    chart: CHART,
    noteCounts,
    start,
    restart,
    setDifficulty,
    applyHit,
    visibleNotes,
    approach: APPROACH_S,
    noteY,
    maxLives: DIFFICULTY_META[state.difficulty].lives,
  };
}
