export const BANANA_IMAGE = "/images/bananas/banana.webp";
export const MONKEY_IMAGE = "/images/bananas/banana-farm-dance.gif";
export const RED_BLOON_IMAGE = "/images/bloons/red-bloon.webp";
export const BLUE_BLOON_IMAGE = "/images/bloons/blue-bloon.webp";
export const GREEN_BLOON_IMAGE = "/images/bloons/green-bloon.webp";
export const PINK_BLOON_IMAGE = "/images/bloons/pink-bloon.webp";
export const MOAB_IMAGE = "/images/bloons/moab.webp";
export const BFB_IMAGE = "/images/bloons/bfb.webp";

/** Starting lives, each bloon hit costs one. */
export const CATCH_LIVES = 3;

/** Cash awarded per banana collected during play. */
export const CASH_PER_BANANA = 8;

/**
 * Endless run, dying after this many bananas still counts as a “clear”
 * for packs / hero XP / featured bonus.
 */
export const CATCH_CLEAR_BANANAS = 40;

export const PLAYER_WIDTH = 100;
export const PLAYER_HEIGHT = 100;
/** Monkey gif has lots of empty corners, keep the catch body tighter. */
export const PLAYER_HIT = { wFrac: 0.52, hFrac: 0.55, yLift: 8 };

export type DropKind =
  | "banana"
  | "red"
  | "blue"
  | "green"
  | "pink"
  | "moab"
  | "bfb";

/** Intrinsic image aspect (width / height) for object-fit-free sizing. */
export const KIND_ASPECT: Record<DropKind, number> = {
  banana: 114 / 118,
  red: 49 / 63,
  blue: 53 / 68,
  green: 57 / 72,
  pink: 63 / 80,
  moab: 230 / 150,
  bfb: 340 / 240,
};

/**
 * Max display dimension (px). Ordinary bloons share one scale so they read as
 * the same size class; MOAB/BFB are clearly bigger.
 */
export const KIND_SCALE: Record<DropKind, number> = {
  banana: 54,
  red: 76,
  blue: 76,
  green: 76,
  pink: 76,
  moab: 132,
  bfb: 170,
};

/**
 * Fixed fall speed (px/s) per kind. Ordinary bloons follow relative BTD6
 * ranking (red < blue < green < pink), compressed so pink stays playable.
 * MOAB/BFB are slower tanks.
 */
export const KIND_SPEED: Record<DropKind, number> = {
  banana: 188,
  red: 165,
  blue: 230,
  green: 295,
  pink: 390,
  moab: 148,
  bfb: 118,
};

/** Damage to hearts on contact. */
export const KIND_DAMAGE: Record<DropKind, number> = {
  banana: 0,
  red: 1,
  blue: 1,
  green: 1,
  pink: 1,
  moab: 2,
  bfb: 3,
};

/**
 * Hit ellipse radii as a fraction of half the drawn width/height
 * (1 = touches the image box edge). Tuned to opaque balloon/blimp bodies.
 */
export const KIND_HIT: Record<
  DropKind,
  { shape: "circle" | "ellipse"; rx: number; ry: number }
> = {
  banana: { shape: "circle", rx: 0.82, ry: 0.82 },
  red: { shape: "circle", rx: 0.9, ry: 0.9 },
  blue: { shape: "circle", rx: 0.9, ry: 0.9 },
  green: { shape: "circle", rx: 0.9, ry: 0.9 },
  pink: { shape: "circle", rx: 0.9, ry: 0.9 },
  moab: { shape: "ellipse", rx: 0.92, ry: 0.78 },
  bfb: { shape: "ellipse", rx: 0.92, ry: 0.8 },
};

export const PLAYER_LERP = 14;

export const SPAWN_BANANA_MS_START = 780;
export const SPAWN_BANANA_MS_MIN = 400;
export const SPAWN_HAZARD_MS_START = 980;
export const SPAWN_HAZARD_MS_MIN = 280;

/** Seconds until each hazard tier can start spawning. */
export const BLUE_UNLOCK_S = 6;
export const GREEN_UNLOCK_S = 14;
export const PINK_UNLOCK_S = 24;
export const MOAB_UNLOCK_S = 32;
export const BFB_UNLOCK_S = 44;

export function drawSizeFor(kind: DropKind): { w: number; h: number } {
  const scale = KIND_SCALE[kind];
  const aspect = KIND_ASPECT[kind];
  if (aspect >= 1) return { w: scale, h: scale / aspect };
  return { w: scale * aspect, h: scale };
}
