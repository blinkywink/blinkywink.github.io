/** Mix Up — 5 medium questions, one from each arcade quiz, Cash paid at end. */

export const MIXUP_MEDIUM_ROUND = 4;

export const MIXUP_CONFIG = {
  roundsPerRun: 5,
  /** End bonus on Cash you would have earned for correct answers. */
  clearBonusRate: 0.6,
  priceTimerSeconds: 10,
  orderTimerSeconds: 10,
  camoRecallSeconds: 20,
} as const;

export type MixupKind =
  | "zoomed"
  | "geoguessr"
  | "pricecheck"
  | "orderup"
  | "camodetection";

export const MIXUP_KINDS: readonly MixupKind[] = [
  "zoomed",
  "geoguessr",
  "pricecheck",
  "orderup",
  "camodetection",
] as const;

export const MIXUP_KIND_LABEL: Record<MixupKind, string> = {
  zoomed: "Zoomed",
  geoguessr: "Geoguessr",
  pricecheck: "Price Check",
  orderup: "Order Up",
  camodetection: "Camo Detection",
};
