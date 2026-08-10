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
  HERO_CLEAR_BONUS,
  HERO_CLEAR_RATIO,
  HERO_LIVES,
  WINDOW_GOOD,
  judgeOffset,
  type Judge,
} from "./config";

export type ChartNote = (typeof CHART.notes)[number];

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
};

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
};

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
  const frameRef = useRef(0);
  const pendingCashRef = useRef(0);
  const awardedRef = useRef(false);

  const flushCash = useCallback(async () => {
    const amount = pendingCashRef.current;
    if (amount <= 0) return;
    pendingCashRef.current = 0;
    const balance = await awardCoins(amount);
    if (balance != null) setCoinBalanceRef.current(balance);
  }, []);

  const start = useCallback(() => {
    awardedRef.current = false;
    pendingCashRef.current = 0;
    notesRef.current = CHART.notes.map((n, i) => ({
      ...n,
      id: i,
      resolved: false,
    }));
    const audio = audioRef.current;
    audio.ensure();
    audio.beginSong();
    audio.scheduleAccompaniment(CHART.accompaniment);
    audio.startDrums(CHART.bpm);
    setState({ ...INITIAL, phase: "playing" });
  }, []);

  const restart = useCallback(() => {
    audioRef.current.stopAll();
    audioRef.current = new HeroAudio();
    cancelAnimationFrame(frameRef.current);
    setState(INITIAL);
    notesRef.current = [];
    awardedRef.current = false;
    pendingCashRef.current = 0;
  }, []);

  const applyHit = useCallback(
    (lane: number) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const now = audioRef.current.songTime();
      // Nearest unresolved note in this lane inside the good window
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
      if (!best) return;

      const dt = now - best.t;
      const judge = judgeOffset(dt);
      if (!judge) return;

      best.resolved = true;
      best.result = judge;
      audioRef.current.playHitNote(best.midi, best.dur, best.vel, judge);

      const pay = cashFor(judge);
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

  // Game clock + auto-misses
  useEffect(() => {
    if (state.phase !== "playing") {
      cancelAnimationFrame(frameRef.current);
      return;
    }

    const tick = () => {
      const now = audioRef.current.songTime();
      let missed = 0;
      for (const n of notesRef.current) {
        if (n.resolved) continue;
        if (now - n.t > WINDOW_GOOD) {
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
        };
        stateRef.current = next;
        setState(next);
      } else {
        setState((prev) => ({ ...prev, songTime: now }));
      }

      const total = CHART.notes.length;
      const resolved = notesRef.current.filter((n) => n.resolved).length;
      const songDone = now >= CHART.duration || resolved >= total;
      const dead = livesAfter <= 0;

      if (dead || songDone) {
        const hitCount = notesRef.current.filter(
          (n) => n.result && n.result !== "miss",
        ).length;
        const ratio = hitCount / Math.max(1, total);
        const cleared = ratio >= HERO_CLEAR_RATIO;

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

        audioRef.current.stopAll();
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [state.phase]);

  useEffect(() => () => audioRef.current.stopAll(), []);

  // Keyboard
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
        return now - n.t < 0.2;
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
  };
}
