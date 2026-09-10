import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, utcToday } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { claimColorcheckDaily } from "../../lib/colorcheckDaily";
import {
  CONNECTIONS_CONFIG,
  connectionsDailyReward,
  connectionsPracticeReward,
  nextMidnightMs,
  todayKey,
} from "./config";
import {
  dailyPuzzle,
  practicePuzzle,
  reconstructBoard,
  type ConnectionGroup,
  type ConnectionPuzzle,
} from "./generatePuzzle";

export type ConnMode = "daily" | "practice";
export type ConnStatus = "playing" | "won";

export type ConnState = {
  mode: ConnMode;
  day: string;
  puzzle: ConnectionPuzzle;
  remaining: string[];
  selected: string[];
  solved: ConnectionGroup[];
  status: ConnStatus;
  reward: number;
  awarded: boolean;
  haulReported: boolean;
  toast: string | null;
  msUntilNext: number;
};

type Persisted = {
  day: string;
  puzzleId: string;
  groups: ConnectionGroup[];
  boardIds: string[];
  remaining: string[];
  solvedIds: string[];
  status: ConnStatus;
  awarded: boolean;
  haulReported: boolean;
  reward: number;
};

const STORAGE_KEY = "bloon-arcade:colorcheck:daily:v1";

function loadPersisted(day: string): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.day !== day) return null;
    if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.boardIds)) {
      return null;
    }
    return {
      day: parsed.day,
      puzzleId: String(parsed.puzzleId ?? ""),
      groups: parsed.groups,
      boardIds: parsed.boardIds.map(String),
      remaining: Array.isArray(parsed.remaining)
        ? parsed.remaining.map(String)
        : [],
      solvedIds: Array.isArray(parsed.solvedIds)
        ? parsed.solvedIds.map(String)
        : [],
      status: parsed.status === "won" ? "won" : "playing",
      awarded: Boolean(parsed.awarded),
      haulReported: Boolean(parsed.haulReported),
      reward: Number(parsed.reward) || 0,
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

function persistFrom(s: ConnState) {
  if (s.mode !== "daily") return;
  savePersisted({
    day: s.day,
    puzzleId: s.puzzle.id,
    groups: s.puzzle.groups,
    boardIds: s.puzzle.board.map((e) => e.id),
    remaining: s.remaining,
    solvedIds: s.solved.map((g) => g.id),
    status: s.status,
    awarded: s.awarded,
    haulReported: s.haulReported,
    reward: s.reward,
  });
}

export function claimDailyHaulOnce(day: string): boolean {
  const saved = loadPersisted(day);
  if (!saved || saved.status !== "won") return false;
  if (saved.haulReported) return false;
  savePersisted({ ...saved, haulReported: true });
  return true;
}

function puzzleFromSaved(saved: Persisted, fallback: ConnectionPuzzle): ConnectionPuzzle {
  if (saved.puzzleId === fallback.id && saved.groups.length === 4) {
    const board = reconstructBoard(saved.boardIds);
    if (board.length === 16) {
      return { id: saved.puzzleId, groups: saved.groups, board };
    }
  }
  return fallback;
}

function makeDaily(): ConnState {
  const day = todayKey();
  const puzzle = dailyPuzzle(day);
  const saved = loadPersisted(day);
  const same = saved && saved.puzzleId === puzzle.id;
  const live = same ? puzzleFromSaved(saved!, puzzle) : puzzle;
  const solved = same
    ? live.groups
        .filter((g) => saved!.solvedIds.includes(g.id))
        .sort((a, b) => a.difficulty - b.difficulty)
    : [];
  let remaining = same
    ? saved!.remaining.filter((id) => live.board.some((e) => e.id === id))
    : live.board.map((e) => e.id);
  let status: ConnStatus = same ? saved!.status : "playing";
  if (solved.length === 4 || remaining.length === 0) {
    status = "won";
    remaining = [];
  }
  return {
    mode: "daily",
    day,
    puzzle: live,
    remaining,
    selected: [],
    solved:
      status === "won" && solved.length < 4
        ? [...live.groups].sort((a, b) => a.difficulty - b.difficulty)
        : solved,
    status,
    reward: same ? saved!.reward : 0,
    awarded: same ? saved!.awarded : false,
    haulReported: same ? saved!.haulReported : false,
    toast: null,
    msUntilNext: Math.max(0, nextMidnightMs() - Date.now()),
  };
}

function makePractice(day: string): ConnState {
  const puzzle = practicePuzzle();
  return {
    mode: "practice",
    day,
    puzzle,
    remaining: puzzle.board.map((e) => e.id),
    selected: [],
    solved: [],
    status: "playing",
    reward: 0,
    awarded: false,
    haulReported: false,
    toast: null,
    msUntilNext: Math.max(0, nextMidnightMs() - Date.now()),
  };
}

/** Reveal today's daily as fully solved (cross-device / revisit). */
function revealWonDaily(base: ConnState): ConnState {
  const puzzle = dailyPuzzle(base.day);
  return {
    ...base,
    mode: "daily",
    puzzle,
    remaining: [],
    selected: [],
    solved: [...puzzle.groups].sort((a, b) => a.difficulty - b.difficulty),
    status: "won",
    awarded: true,
    haulReported: true,
    reward: base.reward || connectionsDailyReward(),
    toast: null,
  };
}

export function useConnections() {
  const { setCoinBalance, profile, isGuest, refreshProfile, ready } = useAuth();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;

  const [state, setState] = useState<ConnState>(() => makeDaily());

  const accountDailyReady = isGuest || (ready && Boolean(profile));
  const alreadyClaimedToday =
    !isGuest &&
    Boolean(profile?.last_colorcheck_day) &&
    profile?.last_colorcheck_day === utcToday();

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

  useEffect(() => {
    if (!alreadyClaimedToday) return;
    const day = utcToday();
    setState((s) => {
      if (s.mode !== "daily" || s.day !== day) return s;
      if (s.status === "won" && s.awarded && s.haulReported) {
        // Still ensure board is fully revealed.
        if (s.solved.length === 4) return s;
      }
      const next = revealWonDaily(s);
      persistFrom(next);
      return next;
    });
  }, [alreadyClaimedToday]);

  const payLock = useRef<string | null>(null);

  const awardIfNeeded = useCallback(
    async (mode: ConnMode, already: boolean) => {
      if (already) return { awarded: true, reward: 0 };
      if (mode === "daily" && !isGuestRef.current) {
        const claimed = await claimColorcheckDaily();
        if (!claimed) return { awarded: false, reward: 0 };
        if (claimed.coins != null) setCoinBalanceRef.current(claimed.coins);
        void refreshProfile();
        return {
          awarded: true,
          reward: claimed.already ? 0 : claimed.amount,
        };
      }
      const reward =
        mode === "daily"
          ? connectionsDailyReward()
          : connectionsPracticeReward();
      if (reward <= 0) return { awarded: true, reward: 0 };
      const balance = await awardCoins(reward, "colorcheck");
      if (balance != null) setCoinBalanceRef.current(balance);
      return { awarded: true, reward };
    },
    [refreshProfile],
  );

  const toggle = useCallback((id: string) => {
    setState((s) => {
      if (s.status !== "playing") return s;
      if (!s.remaining.includes(id)) return s;
      const on = s.selected.includes(id);
      if (on) {
        return { ...s, selected: s.selected.filter((x) => x !== id), toast: null };
      }
      if (s.selected.length >= CONNECTIONS_CONFIG.groupSize) return s;
      return { ...s, selected: [...s.selected, id], toast: null };
    });
  }, []);

  const deselectAll = useCallback(() => {
    setState((s) =>
      s.status === "playing" ? { ...s, selected: [], toast: null } : s,
    );
  }, []);

  const submit = useCallback(() => {
    setState((s) => {
      if (s.status !== "playing") return s;
      if (s.mode === "daily" && !accountDailyReady) return s;
      if (s.selected.length !== CONNECTIONS_CONFIG.groupSize) return s;

      const sel = new Set(s.selected);
      const match = s.puzzle.groups.find(
        (g) =>
          g.entityIds.length === sel.size &&
          g.entityIds.every((id) => sel.has(id)) &&
          !s.solved.some((x) => x.id === g.id),
      );

      if (match) {
        const solved = [...s.solved, match].sort(
          (a, b) => a.difficulty - b.difficulty,
        );
        const remaining = s.remaining.filter((id) => !sel.has(id));
        const won = remaining.length === 0;
        let next: ConnState = {
          ...s,
          selected: [],
          solved,
          remaining,
          toast: won ? "Nice — all four groups!" : match.label,
          status: won ? "won" : "playing",
        };
        persistFrom(next);

        if (won) {
          const payKey = `${s.mode}:${s.puzzle.id}:${s.day}`;
          const shouldPay = !s.awarded && payLock.current !== payKey;
          if (shouldPay) payLock.current = payKey;
          if (shouldPay) {
            const mode = s.mode;
            const day = s.day;
            const puzzleId = s.puzzle.id;
            const wasAwarded = s.awarded;
            queueMicrotask(() => {
              void awardIfNeeded(mode, wasAwarded).then((r) => {
                setState((cur) => {
                  if (cur.mode !== mode || cur.day !== day) return cur;
                  if (cur.puzzle.id !== puzzleId) return cur;
                  const updated: ConnState = {
                    ...cur,
                    awarded: r.awarded || cur.awarded,
                    reward: r.reward || cur.reward,
                    status: "won",
                  };
                  persistFrom(updated);
                  return updated;
                });
              });
            });
          }
        }
        return next;
      }

      let oneAway = false;
      for (const g of s.puzzle.groups) {
        if (s.solved.some((x) => x.id === g.id)) continue;
        const hits = g.entityIds.filter((id) => sel.has(id)).length;
        if (hits === 3) {
          oneAway = true;
          break;
        }
      }

      const next = {
        ...s,
        selected: [],
        toast: oneAway ? "One away…" : "Not a group",
      };
      persistFrom(next);
      return next;
    });
  }, [accountDailyReady, awardIfNeeded]);

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

  return useMemo(
    () => ({
      state,
      toggle,
      deselectAll,
      submit,
      playPractice,
      markHaulReported,
      cleared: state.status === "won",
    }),
    [state, toggle, deselectAll, submit, playPractice, markHaulReported],
  );
}
