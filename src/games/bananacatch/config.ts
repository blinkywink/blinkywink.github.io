export const BANANA_IMAGE = "/images/bananas/banana.webp";
export const MONKEY_IMAGE = "/images/bananas/banana-farm-dance.gif";
export const MEADOW_BG_IMAGE = "/images/bananas/monkey-meadow-bg.webp";
export const RED_BLOON_IMAGE = "/images/bloons/red-bloon.webp";
export const BLUE_BLOON_IMAGE = "/images/bloons/blue-bloon.webp";
export const GREEN_BLOON_IMAGE = "/images/bloons/green-bloon.webp";
export const PINK_BLOON_IMAGE = "/images/bloons/pink-bloon.webp";
export const MOAB_IMAGE = "/images/bloons/moab.webp";
export const BFB_IMAGE = "/images/bloons/bfb.webp";

/** Starting lives, each bloon hit costs one. */
export const CATCH_LIVES = 3;

/** Fewer bananas, each one pays more. */
export const CASH_PER_BANANA = 35;

/**
 * Endless run, dying after this many bananas still counts as a “clear”
 * for packs / hero XP / featured bonus.
 */
export const CATCH_CLEAR_BANANAS = 25;

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
  // Landscape source art; rendered rotated 90° CW so the nose points down.
  moab: 230 / 150,
  bfb: 340 / 240,
};

/**
 * Max display dimension (px). Ordinary bloons are small; blimps dominate.
 */
export const KIND_SCALE: Record<DropKind, number> = {
  banana: 44,
  red: 44,
  blue: 44,
  green: 44,
  pink: 44,
  moab: 240,
  bfb: 300,
};

/**
 * Fixed fall speed (px/s) per kind. Easier pacing than the arcade peak.
 * Rank: red < blue < green < pink; blimps drift.
 */
export const KIND_SPEED: Record<DropKind, number> = {
  banana: 155,
  red: 115,
  blue: 150,
  green: 185,
  pink: 235,
  moab: 95,
  bfb: 78,
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
 * For moab/bfb, hit axes use the post-90° visual box (see hitsPlayer).
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
  moab: { shape: "ellipse", rx: 0.78, ry: 0.92 },
  bfb: { shape: "ellipse", rx: 0.8, ry: 0.92 },
};

/** Blimps face nose-down (wiki art is sideways). */
export const BLIMP_BASE_ROT = 90;

export const PLAYER_LERP = 14;

/** Scarcer bananas. */
export const SPAWN_BANANA_MS_START = 1200;
export const SPAWN_BANANA_MS_MIN = 720;
/** Gentler hazard pressure. */
export const SPAWN_HAZARD_MS_START = 1300;
export const SPAWN_HAZARD_MS_MIN = 480;

/** Seconds until each hazard tier can start spawning. */
export const BLUE_UNLOCK_S = 10;
export const GREEN_UNLOCK_S = 20;
export const PINK_UNLOCK_S = 32;
export const MOAB_UNLOCK_S = 42;
export const BFB_UNLOCK_S = 58;

export function drawSizeFor(kind: DropKind): { w: number; h: number } {
  const scale = KIND_SCALE[kind];
  const aspect = KIND_ASPECT[kind];
  if (aspect >= 1) return { w: scale, h: scale / aspect };
  return { w: scale * aspect, h: scale };
}

export function isBlimp(kind: DropKind): boolean {
  return kind === "moab" || kind === "bfb";
}
