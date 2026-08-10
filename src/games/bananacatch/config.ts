export const BANANA_IMAGE = "/images/bananas/long-life-bananas.webp";
export const MONKEY_IMAGE = "/images/bananas/banana-farm-dance.gif";
export const RED_BLOON_IMAGE = "/images/bloons/red-bloon.png";

/** Bananas needed to clear a run. */
export const CATCH_GOAL = 35;

/** Starting lives — each bloon hit costs one. */
export const CATCH_LIVES = 3;

/** Cash awarded per banana collected during play. */
export const CASH_PER_BANANA = 25;

/** Bonus Cash for clearing the goal. */
export const CATCH_WIN_REWARD = 600;

export const PLAYER_WIDTH = 88;
export const PLAYER_HEIGHT = 88;
export const BANANA_SIZE = 46;
export const BLOON_SIZE = 42;

/** How quickly the monkey eases toward the pointer (higher = snappier). */
export const PLAYER_LERP = 14;

export const SPAWN_BANANA_MS_START = 720;
export const SPAWN_BANANA_MS_MIN = 340;
export const SPAWN_BLOON_MS_START = 1600;
export const SPAWN_BLOON_MS_MIN = 720;

export const FALL_SPEED_BANANA = { min: 140, max: 220 };
export const FALL_SPEED_BLOON = { min: 160, max: 280 };
