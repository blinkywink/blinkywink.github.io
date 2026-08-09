import { heroById, heroPortraitForLevel, type HeroEntity } from "../data/heroes";
import {
  heroLevelFromProfile,
  type ShoppableHeroId,
} from "./profileHeroes";

/** Level-1 balanced constants. L20 targets noted for later scaling. */
export const HERO_EFFECTS_L1 = {
  quincy: { bonusCashPerCorrect: 10 }, // L20 target ~500
  gwendolin: { streakBonusPct: 0.03 }, // L20 ~0.15
  "obyn-greenfoot": { extraCardChance: 0.04 }, // L20 ~0.1
  benjamin: { dupCashBonusPct: 0.15 },
  ezili: { t5WeightBonus: 0.003 }, // +0.3% abs
  sauda: { btd6DiscountChance: 0.07, btd6DiscountPct: 0.07 },
  psi: { paragonWeightBonus: 0.0005 }, // +0.05% abs
  silas: { featuredFreezeChance: 0.2 },
} as const;

export type EquippedHeroContext = {
  heroId: ShoppableHeroId;
  level: number;
  hero: HeroEntity;
  portrait: string;
};

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

export function heroBlurb(heroId: string): string {
  const e = HERO_EFFECTS_L1;
  switch (heroId) {
    case "quincy":
      return `+${e.quincy.bonusCashPerCorrect} Cash on each quiz correct`;
    case "gwendolin":
      return `+${pctLabel(e.gwendolin.streakBonusPct)} Cash on streak corrects (2+)`;
    case "obyn-greenfoot":
      return `${pctLabel(e["obyn-greenfoot"].extraCardChance)} chance of +1 pack card`;
    case "benjamin":
      return `+${pctLabel(e.benjamin.dupCashBonusPct)} Cash from pack duplicates`;
    case "ezili":
      return `+${pctLabel(e.ezili.t5WeightBonus)} absolute T5 pack weight`;
    case "sauda":
      return `${pctLabel(e.sauda.btd6DiscountChance)} chance BTD6 packs cost ${pctLabel(e.sauda.btd6DiscountPct)} less`;
    case "psi":
      return `+${pctLabel(e.psi.paragonWeightBonus)} absolute Paragon pack weight`;
    case "silas":
      return `${pctLabel(e.silas.featuredFreezeChance)} chance to freeze featured clear for one more`;
    default:
      return "Hero passive";
  }
}
