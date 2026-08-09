import { allCardSpecs } from "./cardCatalog";
import {
  dayStamp,
  formatShopCountdown,
  msUntilShopRotation,
  nextUtcMidnightMs,
} from "./packTheme";
import { maxPathTier, type MonkeyCardSpec } from "./pathCombos";

/** Free Cash in the daily reward row. */
export const DAILY_CASH_AMOUNT = 500;

/** Shared day roll: this % of days the daily card is T4 instead of T3. */
export const DAILY_CARD_T4_CHANCE = 0.1;

export type DailyCardReward = {
  card: MonkeyCardSpec;
  tier: 3 | 4;
  dayKey: string;
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cardsAtTier(tier: 3 | 4): MonkeyCardSpec[] {
  return allCardSpecs().filter(
    (c) => !c.isParagon && maxPathTier(c.pathLevels) === tier,
  );
}

/**
 * Same card for every player on a given UTC day.
 * Base pool is T3; ~10% of days upgrade the pick to T4.
 */
export function dailyCardForDay(dayKey = dayStamp()): DailyCardReward {
  const seed = hashString(`daily-card:${dayKey}`);
  const tier: 3 | 4 =
    seed % 1000 < Math.round(DAILY_CARD_T4_CHANCE * 1000) ? 4 : 3;
  const pool = cardsAtTier(tier);
  if (!pool.length) {
    const fallback = cardsAtTier(3);
    const card = fallback[0];
    if (!card) {
      throw new Error("No daily card pool available");
    }
    return { card, tier: 3, dayKey };
  }
  const pickSeed = hashString(`daily-card-pick:${dayKey}:${tier}`);
  const card = pool[pickSeed % pool.length]!;
  return { card, tier, dayKey };
}

export function todaysDailyCard(now = new Date()): DailyCardReward {
  return dailyCardForDay(dayStamp(now));
}

export function msUntilDailyRefresh(now = new Date()): number {
  return msUntilShopRotation(now);
}

export function formatDailyCountdown(ms: number): string {
  return formatShopCountdown(ms);
}

export function nextDailyRefreshMs(now = new Date()): number {
  return nextUtcMidnightMs(now);
}
