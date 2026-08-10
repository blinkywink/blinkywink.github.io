import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { HeroAudio } from "./audioEngine";
import {
  APPROACH_S,
  CASH_PER_GOOD,
  CASH_PER_GREAT,
  CASH_PER_PERFECT,
  CHART,
  EMPTY_STREAK_KILL,
  HERO_CLEAR_BONUS,
  HERO_CLEAR_RATIO,
  HERO_LIVES,
  HIT_LINE_Y,
  SPAWN_Y,
  WINDOW_GOOD,
  judgeOffset,
  leadInSeconds,
  type Judge,
} from "./config";

export type ChartNote = {
  t: number;
  midi: number;
  dur: number;
  vel: number;
  lane: number;
};

export type ActiveNote = ChartNote & {
  id: number;
  resolved: boolean;
  result?: Judge;
};

export type HeroPhase = "ready" | "playing" | "results";

export type HeroState = {
  phase: HeroPhase;
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
  /** Full bar-17 loops completed after the first lap. */
  loops: number;
  /** Consecutive empty / wrong-key presses. */
  emptyStreak: number;
};

type Segment = {
  duration: number;
  notes: readonly ChartNote[];
  accompaniment: readonly {
    t: number;
    midi: number;
    dur: number;
    vel: number;
  }[];
};

const INTRO: Segment = CHART.intro ?? {
  duration: CHART.duration,
  notes: CHART.notes,
  accompaniment: CHART.accompaniment,
};
const LOOP: Segment = CHART.loop ?? INTRO;

const INITIAL: HeroState = {
  phase: "ready",
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
  loops: 0,
  emptyStreak: 0,
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

/** Progress through the current lap (intro, then each bar-17 loop). */
export function loopProgress(songTime: number): number {
  if (songTime <= 0) return 0;
  if (songTime < INTRO.duration) {
    return Math.min(100, (songTime / INTRO.duration) * 100);
  }
  const into = (songTime - INTRO.duration) % LOOP.duration;
  return Math.min(100, (into / LOOP.duration) * 100);
}

export function loopsCompleted(songTime: number): number {
  if (songTime < INTRO.duration) return 0;
  return Math.floor((songTime - INTRO.duration) / LOOP.duration);
}

const KEY_TO_LANE: Record<string, number> = {
  d: 0,
  f: 1,
  j: 2,
  k: 3,
};

function cashFor(j: Judge): number {
  if (j === "perfect") return CASH_PER_PERFECT;
  if (j === "great") return CASH_PER_GREAT;
  if (j === "good") return CASH_PER_GOOD;
  return 0;
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
  const nextIdRef = useRef(0);
  /** Song-time when the next unscheduled segment begins. */
  const nextSegAtRef = useRef(0);
  const attemptedRef = useRef(0);
  const hitsRef = useRef(0);
  const frameRef = useRef(0);
  const pendingCashRef = useRef(0);
  const burstIdRef = useRef(0);
  const pressTimers = useRef<Record<number, number>>({});

  const flushCash = useCallback(async () => {
    const amount = pendingCashRef.current;
    if (amount <= 0) return;
    pendingCashRef.current = 0;
    const balance = await awardCoins(amount);
    if (balance != null) setCoinBalanceRef.current(balance);
  }, []);

  const appendSegment = useCallback((seg: Segment, offset: number) => {
    for (const n of seg.notes) {
      // Keep notes whose attack is at or before the segment cut (on-boundary phrase)
      if (n.t > seg.duration + 0.001) continue;
      notesRef.current.push({
        ...n,
        t: +(n.t + offset).toFixed(4),
        id: nextIdRef.current++,
        resolved: false,
      });
    }
    const acc = seg.accompaniment.filter((n) => n.t <= seg.duration + 0.001);
    audioRef.current.scheduleAccompaniment(acc, offset);
    nextSegAtRef.current = +(offset + seg.duration).toFixed(4);
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
      setState((prev) => ({
        ...prev,
        pressed: prev.pressed.filter((l) => l !== lane),
      }));
    }, 110);
  }, []);

  const start = useCallback(() => {
    const leadIn = leadInSeconds(CHART.bpm);
    pendingCashRef.current = 0;
    attemptedRef.current = 0;
    hitsRef.current = 0;
    nextIdRef.current = 0;
    notesRef.current = [];
    const audio = audioRef.current;
    audio.ensure();
    audio.beginSong(leadIn);
    appendSegment(INTRO, 0);
    audio.startCountIn(CHART.bpm);
    setState({
      ...INITIAL,
      phase: "playing",
      songTime: -leadIn,
      countdown: countdownFromSongTime(-leadIn, CHART.bpm),
    });
  }, [appendSegment]);

  const restart = useCallback(() => {
    audioRef.current.stopAll();
    audioRef.current = new HeroAudio();
    cancelAnimationFrame(frameRef.current);
    for (const t of Object.values(pressTimers.current)) window.clearTimeout(t);
    pressTimers.current = {};
    setState(INITIAL);
    notesRef.current = [];
    pendingCashRef.current = 0;
    nextSegAtRef.current = 0;
  }, []);

  const applyHit = useCallback(
    (lane: number) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      flashPress(lane);

      const now = audioRef.current.songTime();
      // No spam penalties during the count-in
      if (now < 0) {
        audioRef.current.playEmptyTap();
        return;
      }

      let best: ActiveNote | null = null;
      let bestAbs = Infinity;
      for (const n of notesRef.current) {
        if (n.resolved || n.lane !== lane) continue;
        const dt = now - n.t;
        const a = Math.abs(dt);
        if (a > WINDOW_GOOD) continue;
        if (a < bestAbs) {
          bestAbs = a;
          best = n;
        }
      }

      const punishEmpty = () => {
        audioRef.current.playEmptyTap();
        const streak = stateRef.current.emptyStreak + 1;
        // First whiff breaks combo; further whiffs also burn lives
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
        window.setTimeout(() => {
          setState((prev) =>
            prev.burst?.id === burstId ? { ...prev, burst: null } : prev,
          );
        }, 360);
      };

      if (!best) {
        punishEmpty();
        return;
      }

      const dt = now - best.t;
      const judge = judgeOffset(dt);
      if (!judge) {
        punishEmpty();
        return;
      }

      best.resolved = true;
      best.result = judge;
      audioRef.current.playHitNote(best.midi, best.dur, best.vel, judge);
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
    [flashPress, flushCash],
  );

  useEffect(() => {
    if (state.phase !== "playing") {
      cancelAnimationFrame(frameRef.current);
      return;
    }

    const tick = () => {
      const now = audioRef.current.songTime();
      const countdown = countdownFromSongTime(now, CHART.bpm);

      // Queue the next bar-17 loop before notes need to appear
      while (now + APPROACH_S + 0.75 >= nextSegAtRef.current) {
        appendSegment(LOOP, nextSegAtRef.current);
      }

      // Drop ancient resolved notes so the list stays bounded
      if (notesRef.current.length > 400) {
        notesRef.current = notesRef.current.filter(
          (n) => !n.resolved || now - n.t < 1.5,
        );
      }

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

      const loops = loopsCompleted(now);
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
          loops,
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
        setState((prev) => ({ ...prev, songTime: now, countdown, loops }));
      }

      // Endless until you pop out
      if (livesAfter <= 0 && now >= 0) {
        const attempted = Math.max(1, attemptedRef.current);
        const ratio = hitsRef.current / attempted;
        const cleared = ratio >= HERO_CLEAR_RATIO;

        setState((prev) => ({
          ...prev,
          phase: "results",
          songTime: now,
          cleared,
          lives: livesAfter,
          countdown: null,
          loops,
        }));

        void (async () => {
          let grant = pendingCashRef.current;
          pendingCashRef.current = 0;
          if (cleared) {
            const loopBonus = Math.round(
              HERO_CLEAR_BONUS * (1 + loops * 0.25),
            );
            grant += loopBonus;
            setState((prev) =>
              prev.phase === "results"
                ? { ...prev, cashEarned: prev.cashEarned + loopBonus }
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
  }, [state.phase, appendSegment]);

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
    return notesRef.current.filter((n) => {
      if (n.resolved && n.result === "miss") {
        return now - n.t < 0.25;
      }
      if (n.resolved) return false;
      return n.t - now < APPROACH_S + 0.05 && n.t - now > -WINDOW_GOOD;
    });
  };

  return {
    state,
    chart: CHART,
    start,
    restart,
    applyHit,
    visibleNotes,
    approach: APPROACH_S,
    noteY,
    maxLives: HERO_LIVES,
    loopProgress,
  };
}
