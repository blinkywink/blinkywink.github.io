import { btd6Pack, towerPack, type PackDef } from "./packTheme";

/** Fixed showcase peeks for the home hub (not live featured rotation). */
export const HUB_PEEK_CARD_IDS = [
  "dart-monkey-0-0-0",
  "ninja-monkey-5-0-0",
  "super-monkey-0-5-0",
] as const;

export type HubPeekCardId = (typeof HUB_PEEK_CARD_IDS)[number];

export function hubPeekCardSrc(cardId: string): string {
  return `/images/hub/card-${cardId}.jpg`;
}

export function hubPeekPacks(): PackDef[] {
  return [btd6Pack(), towerPack("Dart Monkey"), towerPack("Ninja Monkey")];
}

export function hubPeekPackSrc(pack: PackDef): string {
  return `/images/hub/pack-${pack.id}.jpg`;
}
