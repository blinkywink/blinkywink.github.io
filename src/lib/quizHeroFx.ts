import { useCallback, useMemo } from "react";
import { useHeroFx } from "../auth/HeroFxProvider";
import { awardCoins } from "./awardCoins";
import {
  heroEffectsAtLevel,
  pctLabel,
  rollChance,
  type EquippedHeroContext,
} from "./heroEffects";
import type { GamePath } from "./routes";
import type { PackPullMods, DupCashMods } from "./packPull";

/** Shared helpers for signed-in equipped hero procs (scaled by level). */
export function useQuizHeroFx() {
  const { equipped, notifyHeroProc } = useHeroFx();
  const fx = useMemo(
    () =>
      equipped
        ? heroEffectsAtLevel(equipped.heroId, equipped.level)
        : null,
    [equipped],
  );

  const resetRunFlags = useCallback(() => {
    // Reserved for per-run state if needed again.
  }, []);

  const streakBonusPct =
    equipped?.heroId === "gwendolin" && fx ? fx.streakBonusPct : 0;

  const onCorrectCash = useCallback(
    async (
      setCoinBalance: (n: number) => void,
      opts?: { alreadyAwarded?: number; gameId?: GamePath },
    ) => {
      if (equipped?.heroId !== "quincy" || !fx) return;
      const bonus = fx.bonusCashPerCorrect;
      if (bonus <= 0) return;
      const bal = await awardCoins(bonus, opts?.gameId);
      if (bal != null) setCoinBalance(bal);
      notifyHeroProc({
        heroId: "quincy",
        message: `Quincy: +${bonus} Cash`,
      });
      void opts;
    },
    [equipped?.heroId, fx, notifyHeroProc],
  );

  const onGwenStreakProc = useCallback(
    (streakAfter: number) => {
      if (equipped?.heroId !== "gwendolin" || streakAfter < 2 || !fx) return;
      notifyHeroProc({
        heroId: "gwendolin",
        message: `Gwendolin: +${pctLabel(fx.streakBonusPct)} streak Cash`,
      });
    },
    [equipped?.heroId, fx, notifyHeroProc],
  );

  const packPullMods = useCallback((): PackPullMods => {
    if (!equipped || !fx) return {};
    const mods: PackPullMods = {};
    if (equipped.heroId === "obyn-greenfoot") {
      mods.extraCardChance = fx.extraCardChance;
    }
    if (equipped.heroId === "ezili") {
      mods.t5WeightBonus = fx.t5WeightBonus;
    }
    if (equipped.heroId === "psi") {
      mods.paragonWeightBonus = fx.paragonWeightBonus;
    }
    return mods;
  }, [equipped, fx]);

  const onObynExtra = useCallback(() => {
    notifyHeroProc({
      heroId: "obyn-greenfoot",
      message: "Obyn: +1 pack card!",
    });
  }, [notifyHeroProc]);

  const dupCashMods = useCallback((): DupCashMods => {
    if (equipped?.heroId !== "benjamin" || !fx) return {};
    return { dupCashBonusPct: fx.dupCashBonusPct };
  }, [equipped?.heroId, fx]);

  const trySaudaDiscount = useCallback(
    (price: number): { price: number; discounted: boolean } => {
      if (equipped?.heroId !== "sauda" || !fx) {
        return { price, discounted: false };
      }
      if (!rollChance(fx.btd6DiscountChance)) {
        return { price, discounted: false };
      }
      const next = Math.max(1, Math.round(price * (1 - fx.btd6DiscountPct)));
      notifyHeroProc({
        heroId: "sauda",
        message: `Sauda: pack −${pctLabel(fx.btd6DiscountPct)}`,
      });
      return { price: next, discounted: true };
    },
    [equipped?.heroId, fx, notifyHeroProc],
  );

  return {
    equipped: equipped as EquippedHeroContext | null,
    streakBonusPct,
    notifyHeroProc,
    resetRunFlags,
    onCorrectCash,
    onGwenStreakProc,
    packPullMods,
    onObynExtra,
    dupCashMods,
    trySaudaDiscount,
  };
}
