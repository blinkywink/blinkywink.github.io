import { useCallback, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { MIXUP_CONFIG, type MixupKind } from "./config";
import { generateMixupRun, type MixupQuestion } from "./generateRun";
import { mixupPayout } from "./scoring";

export type MixupPhase = "playing" | "reveal" | "results";

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
  questions: MixupQuestion[];
  index: number;
  correctKinds: MixupKind[];
  feedback: MixupFeedback | null;
  results: MixupResults | null;
  awarded: boolean;
};

function fresh(): State {
  return {
    phase: "playing",
    questions: generateMixupRun(),
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

  const [state, setState] = useState<State>(() => fresh());
  const awarding = useRef(false);

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

        if (pay.total > 0 && !awarding.current) {
          awarding.current = true;
          void awardCoins(pay.total).then((balance) => {
            if (balance != null) setCoinBalanceRef.current(balance);
            awarding.current = false;
          });
        }

        return {
          ...s,
          phase: "results",
          feedback: null,
          results,
          awarded: pay.total > 0,
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

  const playAgain = useCallback(() => {
    awarding.current = false;
    setState(fresh());
  }, []);

  return {
    state,
    current,
    roundsPerRun: MIXUP_CONFIG.roundsPerRun,
    settle,
    goNext,
    playAgain,
  };
}
