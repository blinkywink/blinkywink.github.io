import { useCallback, useRef } from "react";
import { useHeroFx } from "../auth/HeroFxProvider";
import { awardCoins } from "./awardCoins";
import {
  HERO_EFFECTS_L1,
  rollChance,
  type EquippedHeroContext,
} from "./heroEffects";
import type { PackPullMods, DupCashMods } from "./packPull";

/** Shared helpers for signed-in equipped hero level-1 procs. */
export function useQuizHeroFx() {
  const { equipped, notifyHeroProc } = useHeroFx();
  const freeSkipReady = useRef(false);
  const freeSkipUsed = useRef(false);

  const resetRunFlags = useCallback(() => {
    freeSkipUsed.current = false;
    freeSkipReady.current = false;
    if (equipped?.heroId === "striker-jones") {
      freeSkipReady.current = rollChance(
        HERO_EFFECTS_L1["striker-jones"].freeSkipChance,
      );
    }
  }, [equipped?.heroId]);

  const streakBonusPct =
    equipped?.heroId === "gwendolin"
      ? HERO_EFFECTS_L1.gwendolin.streakBonusPct
      : 0;

  const onCorrectCash = useCallback(
    async (
      setCoinBalance: (n: number) => void,
      opts?: { alreadyAwarded?: number },
    ) => {
      if (equipped?.heroId !== "quincy") return;
      const bonus = HERO_EFFECTS_L1.quincy.bonusCashPerCorrect;
      const bal = await awardCoins(bonus);
      if (bal != null) setCoinBalance(bal);
      notifyHeroProc({
        heroId: "quincy",
        message: `Quincy: +${bonus} Cash`,
      });
      void opts;
    },
    [equipped?.heroId, notifyHeroProc],
  );

  const onGwenStreakProc = useCallback(
    (streakAfter: number) => {
      if (equipped?.heroId !== "gwendolin" || streakAfter < 2) return;
      notifyHeroProc({
        heroId: "gwendolin",
        message: "Gwendolin: streak Cash boosted",
      });
    },
    [equipped?.heroId, notifyHeroProc],
  );

  /** Returns true if skip should not cost a life. */
  const tryFreeSkip = useCallback((): boolean => {
    if (equipped?.heroId !== "striker-jones") return false;
    if (freeSkipUsed.current || !freeSkipReady.current) return false;
    freeSkipUsed.current = true;
    freeSkipReady.current = false;
    notifyHeroProc({
      heroId: "striker-jones",
      message: "Striker Jones: free skip!",
    });
    return true;
  }, [equipped?.heroId, notifyHeroProc]);

  /** Etienne: on miss, maybe boost zoom/hint. */
  const tryEtienneBoost = useCallback((): boolean => {
    if (equipped?.heroId !== "etienne") return false;
    if (!rollChance(HERO_EFFECTS_L1.etienne.earlierHintChance)) return false;
    notifyHeroProc({
      heroId: "etienne",
      message: "Etienne: earlier hint!",
    });
    return true;
  }, [equipped?.heroId, notifyHeroProc]);

  const packPullMods = useCallback((): PackPullMods => {
    if (!equipped) return {};
    const mods: PackPullMods = {};
    if (equipped.heroId === "obyn-greenfoot") {
      mods.extraCardChance = HERO_EFFECTS_L1["obyn-greenfoot"].extraCardChance;
    }
    if (equipped.heroId === "ezili") {
      mods.t5WeightBonus = HERO_EFFECTS_L1.ezili.t5WeightBonus;
    }
    if (equipped.heroId === "psi") {
      mods.paragonWeightBonus = HERO_EFFECTS_L1.psi.paragonWeightBonus;
    }
    return mods;
  }, [equipped]);

  const onObynExtra = useCallback(() => {
    notifyHeroProc({
      heroId: "obyn-greenfoot",
      message: "Obyn: +1 pack card!",
    });
  }, [notifyHeroProc]);

  const dupCashMods = useCallback((): DupCashMods => {
    if (equipped?.heroId !== "benjamin") return {};
    return {
      dupCashBonusPct: HERO_EFFECTS_L1.benjamin.dupCashBonusPct,
    };
  }, [equipped?.heroId]);

  const trySaudaDiscount = useCallback(
    (price: number): { price: number; discounted: boolean } => {
      if (equipped?.heroId !== "sauda") return { price, discounted: false };
      if (!rollChance(HERO_EFFECTS_L1.sauda.btd6DiscountChance)) {
        return { price, discounted: false };
      }
      const next = Math.max(
        1,
        Math.round(price * (1 - HERO_EFFECTS_L1.sauda.btd6DiscountPct)),
      );
      notifyHeroProc({
        heroId: "sauda",
        message: `Sauda: pack −${HERO_EFFECTS_L1.sauda.btd6DiscountPct * 100}%`,
      });
      return { price: next, discounted: true };
    },
    [equipped?.heroId, notifyHeroProc],
  );

  return {
    equipped: equipped as EquippedHeroContext | null,
    streakBonusPct,
    notifyHeroProc,
    resetRunFlags,
    onCorrectCash,
    onGwenStreakProc,
    tryFreeSkip,
    tryEtienneBoost,
    packPullMods,
    onObynExtra,
    dupCashMods,
    trySaudaDiscount,
  };
}
