export const BANANA_IMAGE = "/images/bananas/banana.webp";
export const MONKEY_IMAGE = "/images/bananas/banana-farm-dance.gif";
export const RED_BLOON_IMAGE = "/images/bloons/red-bloon.png";
export const MOAB_IMAGE = "/images/bloons/moab.webp";
export const BFB_IMAGE = "/images/bloons/bfb.webp";

/** Starting lives — obstacle hits cost one or more. */
export const CATCH_LIVES = 3;

/** Cash awarded per banana collected during play. */
export const CASH_PER_BANANA = 8;

/**
 * Endless run — dying after this many bananas still counts as a “clear”
 * for packs / hero XP / featured bonus.
 */
export const CATCH_CLEAR_BANANAS = 40;

export const PLAYER_WIDTH = 100;
export const PLAYER_HEIGHT = 100;
export const BANANA_SIZE = { min: 40, max: 52 };
export const RED_SIZE = { min: 38, max: 48 };
export const MOAB_SIZE = { min: 72, max: 92 };
export const BFB_SIZE = { min: 96, max: 120 };

/** How quickly the monkey eases toward the pointer (higher = snappier). */
export const PLAYER_LERP = 14;

export const SPAWN_BANANA_MS_START = 780;
export const SPAWN_BANANA_MS_MIN = 400;
/** Hazards ramp hard — starts busy, gets ruthless. */
export const SPAWN_HAZARD_MS_START = 980;
export const SPAWN_HAZARD_MS_MIN = 280;

export const FALL_SPEED_BANANA = { min: 140, max: 230 };
export const FALL_SPEED_RED = { min: 180, max: 340 };
export const FALL_SPEED_MOAB = { min: 145, max: 240 };
export const FALL_SPEED_BFB = { min: 120, max: 200 };

/** Seconds until MOABs / BFBs can start spawning. */
export const MOAB_UNLOCK_S = 8;
export const BFB_UNLOCK_S = 18;
