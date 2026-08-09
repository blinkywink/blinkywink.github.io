export const RED_BLOON_IMAGE = "/images/bloons/red-bloon.png";

export type SweeperDifficulty = "easy" | "medium";

export type SweeperDifficultyConfig = {
  id: SweeperDifficulty;
  label: string;
  rows: number;
  cols: number;
  mines: number;
  /** Cash for clearing the board. */
  winReward: number;
};

export const SWEEPER_DIFFICULTIES: Record<
  SweeperDifficulty,
  SweeperDifficultyConfig
> = {
  easy: {
    id: "easy",
    label: "Easy",
    rows: 9,
    cols: 9,
    mines: 10,
    winReward: 150,
  },
  medium: {
    id: "medium",
    label: "Medium",
    rows: 16,
    cols: 16,
    mines: 40,
    winReward: 400,
  },
};

export const SWEEPER_DEFAULT_DIFFICULTY: SweeperDifficulty = "easy";
