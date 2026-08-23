import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, utcToday } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { claimBlowfreeDaily } from "../../lib/blowfreeDaily";
import {
  blowFreeDailyReward,
  blowFreePracticeReward,
} from "../rewards";
import {
  nextMidnightMs,
  todayKey,
  type BlowColor,
  type BlowLevel,
  type Cell,
} from "./config";
import { dailyLevel, practiceLevel } from "./generate";
import {
  allPairsConnected,
  beginPath,
  connectedCount,
  emptyPaths,
  extendPath,
  filledCount,
  isLevelCleared,
  type PathMap,
} from "./logic";

export type BlowMode = "daily" | "practice";
export type BlowStatus = "playing" | "won";

export type BlowState = {
  mode: BlowMode;
  day: string;
  level: BlowLevel;
  paths: PathMap;
  status: BlowStatus;
  reward: number;
  /** Cash already paid for this board. */
  awarded: boolean;
  /** Haul / pack callback already fired for today's daily. */
  haulReported: boolean;
  dragColor: BlowColor | null;
  msUntilNext: number;
};

type Persisted = {
  day: string;
  paths: PathMap;
  status: BlowStatus;
  awarded: boolean;
  haulReported: boolean;
  reward: number;
  levelId: string;
};

const STORAGE_KEY = "bloon-arcade:blowfree:daily:v7";

function loadPersisted(day: string): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.day !== day) return null;
    return {
      day: parsed.day,
      paths: parsed.paths && typeof parsed.paths === "object" ? parsed.paths : {},
      status: parsed.status === "won" ? "won" : "playing",
      awarded: Boolean(parsed.awarded),
      haulReported: Boolean(parsed.haulReported),
      reward: Number(parsed.reward) || 0,
      levelId: String(parsed.levelId ?? ""),
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

function persistFrom(s: BlowState) {
  if (s.mode !== "daily") return;
  savePersisted({
    day: s.day,
    paths: s.paths,
    status: s.status,
    awarded: s.awarded,
    haulReported: s.haulReported,
    reward: s.reward,
    levelId: s.level.id,
  });
}

/** Sync write so remounts (Play again) can't re-fire hauls before React state commits. */
export function claimDailyHaulOnce(day: string): boolean {
  const saved = loadPersisted(day);
  if (!saved || saved.status !== "won") return false;
  if (saved.haulReported) return false;
  savePersisted({ ...saved, haulReported: true });
  return true;
}

function makeDaily(): BlowState {
  const day = todayKey();
  const level = dailyLevel(day);
  const saved = loadPersisted(day);
  const same = saved && saved.levelId === level.id;
  const paths = same ? saved!.paths : emptyPaths();
  let status: BlowStatus = same ? saved!.status : "playing";
  if (status === "playing" && isLevelCleared(level, paths)) status = "won";
  return {
    mode: "daily",
    day,
    level,
    paths,
    status,
    reward: same ? saved!.reward : 0,
    awarded: same ? saved!.awarded : false,
    haulReported: same ? saved!.haulReported : false,
    dragColor: null,
    msUntilNext: Math.max(0, nextMidnightMs() - Date.now()),
  };
}

function makePractice(day: string): BlowState {
  return {
    mode: "practice",
    day,
    level: practiceLevel(),
    paths: emptyPaths(),
    status: "playing",
    reward: 0,
    awarded: false,
    haulReported: false,
    dragColor: null,
    msUntilNext: Math.max(0, nextMidnightMs() - Date.now()),
  };
}

export function useBlowFree() {
  const { setCoinBalance, profile, isGuest, refreshProfile, ready } = useAuth();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;

  const [state, setState] = useState<BlowState>(() => makeDaily());

  const accountDailyReady = isGuest || (ready && Boolean(profile));
  const alreadyClaimedToday =
    !isGuest &&
    Boolean(profile?.last_blowfree_day) &&
    profile?.last_blowfree_day === utcToday();

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((s) => {
        const day = todayKey();
        if (s.mode === "daily" && s.day !== day) return makeDaily();
        return {
          ...s,
          msUntilNext: Math.max(0, nextMidnightMs() - Date.now()),
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  /** Account already cleared today's daily elsewhere — show completed. */
  useEffect(() => {
    if (!alreadyClaimedToday) return;
    const day = utcToday();
    setState((s) => {
      if (s.mode !== "daily" || s.day !== day) return s;
      // This device already cleared — leave haulReported alone so packs can fire.
      if (s.status === "won") {
        if (s.awarded) return s;
        const next: BlowState = {
          ...s,
          awarded: true,
          reward: s.reward || blowFreeDailyReward(),
        };
        persistFrom(next);
        return next;
      }
      // Cross-device: skip the puzzle; don't re-fire haul/packs.
      const next: BlowState = {
        ...s,
        status: "won",
        awarded: true,
        haulReported: true,
        reward: s.reward || blowFreeDailyReward(),
      };
      persistFrom(next);
      return next;
    });
  }, [alreadyClaimedToday]);

  /** Guards Strict Mode double-invoking the payout. */
  const payLock = useRef<string | null>(null);

  const awardIfNeeded = useCallback(
    async (mode: BlowMode, already: boolean) => {
      if (already) return { awarded: true, reward: 0 };
      if (mode === "daily" && !isGuestRef.current) {
        const claimed = await claimBlowfreeDaily();
        if (!claimed) return { awarded: false, reward: 0 };
        if (claimed.coins != null) setCoinBalanceRef.current(claimed.coins);
        void refreshProfile();
        return {
          awarded: true,
          reward: claimed.already ? 0 : claimed.amount,
        };
      }
      const reward =
        mode === "daily" ? blowFreeDailyReward() : blowFreePracticeReward();
      if (reward <= 0) return { awarded: true, reward: 0 };
      const balance = await awardCoins(reward);
      if (balance != null) setCoinBalanceRef.current(balance);
      return { awarded: true, reward };
    },
    [refreshProfile],
  );

  const finishIfCleared = useCallback(
    (s: BlowState, paths: PathMap, dragColor: BlowColor | null): BlowState => {
      if (s.status !== "playing" || !isLevelCleared(s.level, paths)) {
        const next = { ...s, paths, dragColor };
        persistFrom(next);
        return next;
      }
      const payKey = `${s.mode}:${s.level.id}:${s.day}`;
      const shouldPay = !s.awarded && payLock.current !== payKey;
      if (shouldPay) payLock.current = payKey;
      const next: BlowState = {
        ...s,
        paths,
        dragColor: null,
        status: "won",
      };
      persistFrom(next);
      if (shouldPay) {
        const mode = s.mode;
        const day = s.day;
        const levelId = s.level.id;
        const wasAwarded = s.awarded;
        queueMicrotask(() => {
          void awardIfNeeded(mode, wasAwarded).then((r) => {
            setState((cur) => {
              if (cur.mode !== mode || cur.day !== day) return cur;
              if (cur.level.id !== levelId) return cur;
              const reward = r.reward || cur.reward;
              const updated: BlowState = {
                ...cur,
                awarded: r.awarded || cur.awarded,
                reward,
                status: "won",
              };
              persistFrom(updated);
              return updated;
            });
          });
        });
      }
      return next;
    },
    [awardIfNeeded],
  );

  const markHaulReported = useCallback(() => {
    setState((s) => {
      if (s.haulReported) return s;
      const next = { ...s, haulReported: true };
      persistFrom(next);
      return next;
    });
  }, []);

  const playPractice = useCallback(() => {
    setState((s) => makePractice(s.day));
  }, []);

  const resetLevel = useCallback(() => {
    setState((s) => {
      if (s.status !== "playing") return s;
      const next = { ...s, paths: emptyPaths(), dragColor: null };
      persistFrom(next);
      return next;
    });
  }, []);

  const pointerDown = useCallback(
    (r: number, c: number) => {
      setState((s) => {
        if (s.status !== "playing") return s;
        if (s.mode === "daily" && !accountDailyReady) return s;
        const started = beginPath(s.level, s.paths, r, c);
        if (!started) return s;
        return finishIfCleared(s, started.paths, started.color);
      });
    },
    [accountDailyReady, finishIfCleared],
  );

  const pointerEnter = useCallback(
    (r: number, c: number) => {
      setState((s) => {
        if (s.status !== "playing" || !s.dragColor) return s;
        if (s.mode === "daily" && !accountDailyReady) return s;
        const nextPaths = extendPath(s.level, s.paths, s.dragColor, r, c);
        if (!nextPaths) return s;
        return finishIfCleared(s, nextPaths, s.dragColor);
      });
    },
    [accountDailyReady, finishIfCleared],
  );

  const pointerUp = useCallback(() => {
    setState((s) => {
      if (s.status !== "playing") return s;
      return finishIfCleared(s, s.paths, null);
    });
  }, [finishIfCleared]);

  const linked = connectedCount(state.level, state.paths);
  const pairs = state.level.pairs.length;
  const filled = filledCount(state.level, state.paths);
  const totalCells = state.level.size * state.level.size;
  const allLinked = allPairsConnected(state.level, state.paths);

  return {
    state,
    linked,
    pairs,
    filled,
    totalCells,
    allLinked,
    playPractice,
    resetLevel,
    markHaulReported,
    pointerDown,
    pointerEnter,
    pointerUp,
  };
}

export type { Cell, PathMap };
