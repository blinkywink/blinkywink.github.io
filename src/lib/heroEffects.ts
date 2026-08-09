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

/** Level-1 balanced constants (kept for call sites / docs). */
export const HERO_EFFECTS_L1 = {
  quincy: { bonusCashPerCorrect: 10 },
  gwendolin: { streakBonusPct: 0.03 },
  "obyn-greenfoot": { extraCardChance: 0.04 },
  benjamin: { dupCashBonusPct: 0.15 },
  ezili: { t5WeightBonus: 0.003 },
  sauda: { btd6DiscountChance: 0.07, btd6DiscountPct: 0.07 },
  psi: { paragonWeightBonus: 0.0005 },
  silas: { featuredFreezeChance: 0.2 },
} as const;

const L1: Record<string, HeroEffectStats> = {
  quincy: { ...ZERO, bonusCashPerCorrect: 10 },
  gwendolin: { ...ZERO, streakBonusPct: 0.03 },
  "obyn-greenfoot": { ...ZERO, extraCardChance: 0.04 },
  benjamin: { ...ZERO, dupCashBonusPct: 0.15 },
  ezili: { ...ZERO, t5WeightBonus: 0.003 },
  sauda: { ...ZERO, btd6DiscountChance: 0.07, btd6DiscountPct: 0.07 },
  psi: { ...ZERO, paragonWeightBonus: 0.0005 },
  silas: { ...ZERO, featuredFreezeChance: 0.2 },
};

const L20: Record<string, HeroEffectStats> = {
  quincy: { ...ZERO, bonusCashPerCorrect: 500 },
  gwendolin: { ...ZERO, streakBonusPct: 0.15 },
  "obyn-greenfoot": { ...ZERO, extraCardChance: 0.1 },
  benjamin: { ...ZERO, dupCashBonusPct: 0.5 },
  ezili: { ...ZERO, t5WeightBonus: 0.012 },
  sauda: { ...ZERO, btd6DiscountChance: 0.25, btd6DiscountPct: 0.2 },
  psi: { ...ZERO, paragonWeightBonus: 0.0025 },
  silas: { ...ZERO, featuredFreezeChance: 0.55 },
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
