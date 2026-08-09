import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import {
  completeMixupDaily,
  fetchMixupDailyStatus,
  formatMixupUnlock,
  mixupDayKey,
  mixupUnlockAtMs,
} from "../../lib/mixupDaily";
import { MIXUP_CONFIG, type MixupKind } from "./config";
import { generateMixupRun, type MixupQuestion } from "./generateRun";
import { mixupPayout } from "./scoring";

export type MixupPhase = "loading" | "locked" | "playing" | "reveal" | "results";

export type MixupFeedback = {
  correct: boolean;
  value: number;
};

export type MixupResults = {
  correct: number;
  total: number;
  base: number;
  bonus: number;
  totalCash: number;
  kindsCorrect: MixupKind[];
};

type State = {
  phase: MixupPhase;
  dayKey: string;
  unlockLabel: string;
  questions: MixupQuestion[];
  index: number;
  correctKinds: MixupKind[];
  feedback: MixupFeedback | null;
  results: MixupResults | null;
  awarded: boolean;
};

function unlockLabelNow(): string {
  return formatMixupUnlock(Math.max(0, mixupUnlockAtMs() - Date.now()));
}

function makePlaying(dayKey: string): State {
  return {
    phase: "playing",
    dayKey,
    unlockLabel: unlockLabelNow(),
    questions: generateMixupRun(dayKey),
    index: 0,
    correctKinds: [],
    feedback: null,
    results: null,
    awarded: false,
  };
}

function makeLocked(dayKey: string): State {
  return {
    phase: "locked",
    dayKey,
    unlockLabel: unlockLabelNow(),
    questions: [],
    index: 0,
    correctKinds: [],
    feedback: null,
    results: null,
    awarded: false,
  };
}

export function useMixUp() {
  const { setCoinBalance } = useAuth();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;

  const [state, setState] = useState<State>(() => ({
    phase: "loading",
    dayKey: mixupDayKey(),
    unlockLabel: unlockLabelNow(),
    questions: [],
    index: 0,
    correctKinds: [],
    feedback: null,
    results: null,
    awarded: false,
  }));
  const awarding = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await fetchMixupDailyStatus();
      if (cancelled) return;
      if (status.completed) {
        setState(makeLocked(status.day));
      } else {
        setState(makePlaying(status.day));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick unlock countdown while locked / after results.
  useEffect(() => {
    if (state.phase !== "locked" && state.phase !== "results") return;
    const tick = () => {
      const label = unlockLabelNow();
      const day = mixupDayKey();
      setState((s) => {
        // New UTC day while staring at the lock screen → open today's run.
        if (s.phase === "locked" && day !== s.dayKey) {
          return makePlaying(day);
        }
        if (s.unlockLabel === label) return s;
        return { ...s, unlockLabel: label };
      });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state.phase]);

  const current = state.questions[state.index] ?? null;

  const settle = useCallback((correct: boolean) => {
    setState((s) => {
      if (s.phase !== "playing") return s;
      const q = s.questions[s.index];
      if (!q) return s;
      const payout = mixupPayout([q.kind]);
      const value = correct ? payout.base : 0;
      const correctKinds = correct
        ? [...s.correctKinds, q.kind]
        : s.correctKinds;
      return {
        ...s,
        phase: "reveal",
        correctKinds,
        feedback: { correct, value },
      };
    });
  }, []);

  const goNext = useCallback(() => {
    setState((s) => {
      if (s.phase !== "reveal") return s;
      const next = s.index + 1;
      if (next >= s.questions.length) {
        const pay = mixupPayout(s.correctKinds);
        const results: MixupResults = {
          correct: s.correctKinds.length,
          total: s.questions.length,
          base: pay.base,
          bonus: pay.bonus,
          totalCash: pay.total,
          kindsCorrect: s.correctKinds,
        };

        if (!awarding.current) {
          awarding.current = true;
          void (async () => {
            const firstClear = await completeMixupDaily();
            if (firstClear && pay.total > 0) {
              const balance = await awardCoins(pay.total);
              if (balance != null) setCoinBalanceRef.current(balance);
            }
            awarding.current = false;
          })();
        }

        return {
          ...s,
          phase: "results",
          feedback: null,
          results,
          awarded: pay.total > 0,
          unlockLabel: unlockLabelNow(),
        };
      }

      return {
        ...s,
        phase: "playing",
        index: next,
        feedback: null,
      };
    });
  }, []);

  return {
    state,
    current,
    roundsPerRun: MIXUP_CONFIG.roundsPerRun,
    settle,
    goNext,
  };
}
