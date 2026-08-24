import type { TowerEntity } from "../../data/types";
import { SHARED_RUN } from "../rewards";

export type DifficultyTier = "easy" | "medium" | "hard" | "extreme";

export type DifficultyConfig = {
  tier: DifficultyTier;
  /** Crop width/height as fraction of min(imageW, imageH). Smaller = harder. */
  cropSize: [number, number];
  /** Extra zoom applied after crop (1 = fill frame). */
  zoom: [number, number];
  /** Max absolute rotation in degrees. */
  rotation: number;
  /** Gaussian-ish blur radius in CSS px of output. */
  blur: [number, number];
  /** Pixel block size; 1 = none. */
  pixelation: [number, number];
  /** Horizontal/vertical stretch deviation from 1. */
  stretch: [number, number];
  /** Brightness multiplier range. */
  brightness: [number, number];
  /** Contrast multiplier range. */
  contrast: [number, number];
  /** Wave distortion amplitude (0-1). */
  distortion: [number, number];
  /** Score multiplier for this tier. */
  scoreMultiplier: number;
};

/**
 * Crop fractions start roomy on easy, then tighten.
 * Zoom extras stay mild - “slightly zoomed” close-ups, not microscopic.
 */
export const DIFFICULTY_PRESETS: Record<DifficultyTier, DifficultyConfig> = {
  easy: {
    tier: "easy",
    cropSize: [0.6, 0.81],
    zoom: [1.06, 1.22],
    rotation: 6,
    blur: [0, 0],
    pixelation: [1, 1],
    stretch: [0.98, 1.02],
    brightness: [0.97, 1.05],
    contrast: [1.02, 1.12],
    distortion: [0, 0],
    scoreMultiplier: 1,
  },
  medium: {
    tier: "medium",
    cropSize: [0.175, 0.275],
    zoom: [1.32, 1.68],
    rotation: 18,
    blur: [0, 0.2],
    pixelation: [1, 1.2],
    stretch: [0.94, 1.06],
    brightness: [0.93, 1.1],
    contrast: [1.02, 1.22],
    distortion: [0, 0.02],
    scoreMultiplier: 1.6,
  },
  hard: {
    tier: "hard",
    cropSize: [0.125, 0.212],
    zoom: [1.48, 1.96],
    rotation: 35,
    blur: [0, 0.8],
    pixelation: [1, 2.5],
    stretch: [0.86, 1.14],
    brightness: [0.85, 1.2],
    contrast: [0.95, 1.3],
    distortion: [0.02, 0.07],
    scoreMultiplier: 2.4,
  },
  extreme: {
    tier: "extreme",
    cropSize: [0.075, 0.137],
    zoom: [1.8, 2.52],
    rotation: 55,
    blur: [0.2, 1.4],
    pixelation: [1.5, 3.5],
    stretch: [0.78, 1.22],
    brightness: [0.75, 1.3],
    contrast: [0.9, 1.4],
    distortion: [0.05, 0.12],
    scoreMultiplier: 3.5,
  },
};

/** Progressive difficulty across a run (+ free play keeps ramping). */
export function difficultyForRound(round: number): DifficultyConfig {
  if (round <= 2) return DIFFICULTY_PRESETS.easy;
  if (round <= 5) return DIFFICULTY_PRESETS.medium;
  if (round <= 8) return DIFFICULTY_PRESETS.hard;
  if (round <= 12) return DIFFICULTY_PRESETS.extreme;
  // Free-play deep: stick on extreme (tightest crop preset)
  return DIFFICULTY_PRESETS.extreme;
}

export type ZoomedConfig = {
  /** Chance to pick a base tower vs an upgrade/paragon. */
  towerChance: number;
  upgradeChance: number;
  roundsPerRun: number;
  /** Soft bias so crops stay somewhat centered (avoid blank edges). */
  cropCenterBias: number;
  /** Guesses allowed per question before the round is failed. */
  maxAttempts: number;
  /** Hearts for the whole run - failing a question costs one. */
  maxLives: number;
  /**
   * Score multipliers for getting it right on attempt 1 / 2 / 3.
   * Index 0 = first try.
   */
  attemptScoreMultipliers: [number, number, number];
};

export const ZOOMED_CONFIG: ZoomedConfig = {
  towerChance: 0.3,
  upgradeChance: 0.7,
  roundsPerRun: SHARED_RUN.roundsPerRun,
  cropCenterBias: 0.45,
  maxAttempts: 3,
  maxLives: SHARED_RUN.maxLives,
  attemptScoreMultipliers: [1, 0.55, 0.3],
};

/** Towers that tend to look similar - used by future modes / helpers. */
export const VISUAL_SIMILARITY: Record<string, string[]> = {
  "Dart Monkey": ["Boomerang Monkey", "Ninja Monkey", "Dartling Gunner"],
  "Boomerang Monkey": ["Dart Monkey", "Tack Shooter", "Druid"],
  "Bomb Shooter": ["Mortar Monkey", "Spike Factory", "Engineer Monkey"],
  "Tack Shooter": ["Boomerang Monkey", "Spike Factory", "Ice Monkey"],
  "Ice Monkey": ["Glue Gunner", "Wizard Monkey", "Druid"],
  "Glue Gunner": ["Ice Monkey", "Alchemist", "Engineer Monkey"],
  "Sniper Monkey": ["Dart Monkey", "Dartling Gunner", "Monkey Ace"],
  "Monkey Sub": ["Monkey Buccaneer", "Dartling Gunner", "Mortar Monkey"],
  "Monkey Buccaneer": ["Monkey Sub", "Monkey Ace", "Heli Pilot"],
  "Monkey Ace": ["Heli Pilot", "Monkey Buccaneer", "Dartling Gunner"],
  "Heli Pilot": ["Monkey Ace", "Monkey Buccaneer", "Dartling Gunner"],
  "Mortar Monkey": ["Bomb Shooter", "Dartling Gunner", "Wizard Monkey"],
  "Dartling Gunner": ["Sniper Monkey", "Dart Monkey", "Super Monkey"],
  "Wizard Monkey": ["Super Monkey", "Ninja Monkey", "Skywarden"],
  "Super Monkey": ["Wizard Monkey", "Dartling Gunner", "Ninja Monkey"],
  "Ninja Monkey": ["Dart Monkey", "Wizard Monkey", "Super Monkey"],
  Alchemist: ["Wizard Monkey", "Druid", "Glue Gunner"],
  Druid: ["Wizard Monkey", "Alchemist", "Skywarden"],
  Skywarden: ["Druid", "Wizard Monkey", "Ice Monkey"],
  "Banana Farm": ["Spike Factory", "Engineer Monkey", "Monkey Village"],
  "Spike Factory": ["Tack Shooter", "Bomb Shooter", "Engineer Monkey"],
  "Monkey Village": ["Banana Farm", "Engineer Monkey", "Beast Handler"],
  "Engineer Monkey": ["Spike Factory", "Bomb Shooter", "Beast Handler"],
  "Beast Handler": ["Druid", "Engineer Monkey", "Monkey Village"],
  Mermonkey: ["Ice Monkey", "Wizard Monkey", "Skywarden"],
  Desperado: ["Sniper Monkey", "Dart Monkey", "Dartling Gunner"],
};

export function visualNeighbors(
  entity: TowerEntity,
  allTowers: string[],
): string[] {
  const mapped = VISUAL_SIMILARITY[entity.tower] ?? [];
  return mapped.filter((t) => allTowers.includes(t));
}
