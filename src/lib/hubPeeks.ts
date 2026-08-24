import { btd6Pack, towerPack, type PackDef } from "./packTheme";

/** Fixed showcase peeks for the home hub Cards tile. */
export const HUB_PEEK_CARD_IDS = [
  "dart-monkey-0-0-0",
  "ninja-monkey-5-0-0",
  "super-monkey-0-5-0",
] as const;

/** Market tile listing preview - distinct from the Cards fan. */
export const HUB_MARKET_PEEK_CARD_ID = "banana-farm-0-0-5";

export type HubPeekCardId = (typeof HUB_PEEK_CARD_IDS)[number];

/** All card faces captured by `npm run export-hub-peeks`. */
export function hubPeekExportCardIds(): string[] {
  return [...HUB_PEEK_CARD_IDS, HUB_MARKET_PEEK_CARD_ID];
}

export function hubPeekCardSrc(cardId: string): string {
  return `/images/hub/card-${cardId}.jpg`;
}

export function hubPeekPacks(): PackDef[] {
  return [btd6Pack(), towerPack("Dart Monkey"), towerPack("Ninja Monkey")];
}

export function hubPeekPackSrc(pack: PackDef): string {
  return `/images/hub/pack-${pack.id}.jpg`;
}
