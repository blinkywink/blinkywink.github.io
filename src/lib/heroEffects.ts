import { heroById, heroPortraitForLevel, type HeroEntity } from "../data/heroes";
import {
  heroLevelFromProfile,
  type ShoppableHeroId,
} from "./profileHeroes";

export type HeroEffectStats = {
  bonusCashPerCorrect: number;
  streakBonusPct: number;
  extraCardChance: number;
  dupCashBonusPct: number;
  t5WeightBonus: number;
  btd6DiscountChance: number;
  btd6DiscountPct: number;
  paragonWeightBonus: number;
  featuredFreezeChance: number;
};

const ZERO: HeroEffectStats = {
  bonusCashPerCorrect: 0,
  streakBonusPct: 0,
  extraCardChance: 0,
  dupCashBonusPct: 0,
  t5WeightBonus: 0,
  btd6DiscountChance: 0,
  btd6DiscountPct: 0,
  paragonWeightBonus: 0,
  featuredFreezeChance: 0,
};

/**
 * Mild passives only — L1 is a nibble (~2–5% niche), L20 is a treat (~12–18%),
 * never run-defining. Anchors: perfect quiz ~2525 Cash, BTD6 pack 1750,
 * featured clear 500, T5 0.7%, Paragon 0.1%.
 */
export const HERO_EFFECTS_L1 = {
  quincy: { bonusCashPerCorrect: 8 },
  gwendolin: { streakBonusPct: 0.025 },
  "obyn-greenfoot": { extraCardChance: 0.03 },
  benjamin: { dupCashBonusPct: 0.1 },
  ezili: { t5WeightBonus: 0.0015 },
  sauda: { btd6DiscountChance: 0.12, btd6DiscountPct: 0.08 },
  psi: { paragonWeightBonus: 0.00025 },
  silas: { featuredFreezeChance: 0.2 },
} as const;

const L1: Record<string, HeroEffectStats> = {
  quincy: { ...ZERO, bonusCashPerCorrect: 8 },
  gwendolin: { ...ZERO, streakBonusPct: 0.025 },
  "obyn-greenfoot": { ...ZERO, extraCardChance: 0.03 },
  benjamin: { ...ZERO, dupCashBonusPct: 0.1 },
  ezili: { ...ZERO, t5WeightBonus: 0.0015 },
  sauda: { ...ZERO, btd6DiscountChance: 0.12, btd6DiscountPct: 0.08 },
  psi: { ...ZERO, paragonWeightBonus: 0.00025 },
  silas: { ...ZERO, featuredFreezeChance: 0.2 },
};

const L20: Record<string, HeroEffectStats> = {
  /** ~+400 on a perfect 10-correct run — not another full quiz. */
  quincy: { ...ZERO, bonusCashPerCorrect: 40 },
  gwendolin: { ...ZERO, streakBonusPct: 0.12 },
  "obyn-greenfoot": { ...ZERO, extraCardChance: 0.08 },
  benjamin: { ...ZERO, dupCashBonusPct: 0.28 },
  /** T5 0.70% → ~1.15% at L20 (~1.6×), not nearly 3×. */
  ezili: { ...ZERO, t5WeightBonus: 0.0045 },
  sauda: { ...ZERO, btd6DiscountChance: 0.22, btd6DiscountPct: 0.15 },
  /** Paragon 0.10% → ~0.19% at L20 (~1.9×). */
  psi: { ...ZERO, paragonWeightBonus: 0.0009 },
  /** Hold procs stay spicy; L20 still expects rotate most of the time. */
  silas: { ...ZERO, featuredFreezeChance: 0.4 },
};

export type EquippedHeroContext = {
  heroId: ShoppableHeroId;
  level: number;
  hero: HeroEntity;
  portrait: string;
};

/** 0 at level 1 → 1 at level 20. */
export function heroLevelT(level: number): number {
  const n = Math.max(1, Math.min(20, Math.floor(level) || 1));
  return (n - 1) / 19;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function heroEffectsAtLevel(
  heroId: string,
  level: number,
): HeroEffectStats {
  const a = L1[heroId];
  const b = L20[heroId];
  if (!a || !b) return { ...ZERO };
  const t = heroLevelT(level);
  return {
    bonusCashPerCorrect: Math.round(
      lerp(a.bonusCashPerCorrect, b.bonusCashPerCorrect, t),
    ),
    streakBonusPct: lerp(a.streakBonusPct, b.streakBonusPct, t),
    extraCardChance: lerp(a.extraCardChance, b.extraCardChance, t),
    dupCashBonusPct: lerp(a.dupCashBonusPct, b.dupCashBonusPct, t),
    t5WeightBonus: lerp(a.t5WeightBonus, b.t5WeightBonus, t),
    btd6DiscountChance: lerp(a.btd6DiscountChance, b.btd6DiscountChance, t),
    btd6DiscountPct: lerp(a.btd6DiscountPct, b.btd6DiscountPct, t),
    paragonWeightBonus: lerp(a.paragonWeightBonus, b.paragonWeightBonus, t),
    featuredFreezeChance: lerp(
      a.featuredFreezeChance,
      b.featuredFreezeChance,
      t,
    ),
  };
}

export function resolveEquippedHero(profile: {
  equipped_hero_id?: string | null;
  hero_levels?: Record<string, number> | null;
  owned_hero_ids?: string[] | null;
} | null): EquippedHeroContext | null {
  const id = profile?.equipped_hero_id?.trim().toLowerCase();
  if (!id) return null;
  const owned = profile?.owned_hero_ids ?? [];
  if (!owned.map(String).includes(id)) return null;
  const hero = heroById(id);
  if (!hero || hero.isAltForm) return null;
  const level = heroLevelFromProfile(profile?.hero_levels ?? {}, id);
  return {
    heroId: id as ShoppableHeroId,
    level,
    hero,
    portrait: heroPortraitForLevel(hero, level),
  };
}

export function rollChance(p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return Math.random() < p;
}

export function pctLabel(fraction: number): string {
  const n = fraction * 100;
  if (Number.isInteger(n)) return `${n}%`;
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}%`;
}

export function heroBlurb(heroId: string, level = 1): string {
  const e = heroEffectsAtLevel(heroId, level);
  switch (heroId) {
    case "quincy":
      return `+${e.bonusCashPerCorrect} Cash on each quiz correct`;
    case "gwendolin":
      return `+${pctLabel(e.streakBonusPct)} Cash on streak corrects (2+)`;
    case "obyn-greenfoot":
      return `${pctLabel(e.extraCardChance)} chance of +1 pack card`;
    case "benjamin":
      return `+${pctLabel(e.dupCashBonusPct)} Cash from pack duplicates`;
    case "ezili":
      return `+${pctLabel(e.t5WeightBonus)} absolute T5 pack weight`;
    case "sauda":
      return `${pctLabel(e.btd6DiscountChance)} chance BTD6 packs cost ${pctLabel(e.btd6DiscountPct)} less`;
    case "psi":
      return `+${pctLabel(e.paragonWeightBonus)} absolute Paragon pack weight`;
    case "silas":
      return `${pctLabel(e.featuredFreezeChance)} chance featured game doesn't change`;
    default:
      return "Hero passive";
  }
}
