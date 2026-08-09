import { heroById, heroPortraitForLevel, type HeroEntity } from "../data/heroes";
import {
  heroLevelFromProfile,
  type ShoppableHeroId,
} from "./profileHeroes";

/** Level-1 balanced constants. L20 targets noted for later scaling. */
export const HERO_EFFECTS_L1 = {
  quincy: { bonusCashPerCorrect: 10 }, // L20 target ~500
  gwendolin: { streakBonusPct: 0.03 }, // L20 ~0.15
  "striker-jones": { freeSkipChance: 0.1 }, // L20 ~0.5
  "obyn-greenfoot": { extraCardChance: 0.04 }, // L20 ~0.1
  "captain-churchill": { autoClearChance: 0.08 },
  benjamin: { dupCashBonusPct: 0.15 },
  ezili: { t5WeightBonus: 0.003 }, // +0.3% abs
  "pat-fusty": { bonusDailyCardChance: 0.15 },
  adora: { hardToMediumChance: 0.12 },
  "admiral-brickell": { easyToMediumChance: 0.12 },
  etienne: { earlierHintChance: 0.15 },
  sauda: { btd6DiscountChance: 0.07, btd6DiscountPct: 0.07 },
  psi: { paragonWeightBonus: 0.0005 }, // +0.05% abs
  geraldo: { shopRerollChance: 0.25 },
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

export function heroBlurb(heroId: string): string {
  switch (heroId) {
    case "quincy":
      return "+10 Cash on quiz corrects";
    case "gwendolin":
      return "+3% Cash from streaks";
    case "striker-jones":
      return "10% chance of a free skip per quiz";
    case "obyn-greenfoot":
      return "4% chance of +1 pack card";
    case "captain-churchill":
      return "Chance to auto-clear a quiz round";
    case "benjamin":
      return "+15% Cash from pack duplicates";
    case "ezili":
      return "Tiny boost to T5 pack luck";
    case "pat-fusty":
      return "Chance of a bonus daily card";
    case "adora":
      return "Chance hard quiz crops become medium";
    case "admiral-brickell":
      return "Chance easy rounds pay like medium";
    case "etienne":
      return "Chance of earlier quiz hints";
    case "sauda":
      return "Chance BTD6 packs cost less";
    case "psi":
      return "Tiny boost to Paragon luck";
    case "geraldo":
      return "Chance to reroll featured tower packs";
    case "silas":
      return "Chance to freeze the featured clear bonus";
    default:
      return "Hero passive";
  }
}
