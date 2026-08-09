/** Shared path helpers for arcade routes. */

export type GamePath =
  | "zoomed"
  | "geoguessr"
  | "pricecheck"
  | "orderup"
  | "bloonle";

export const GAME_PATHS: readonly GamePath[] = [
  "zoomed",
  "geoguessr",
  "pricecheck",
  "orderup",
  "bloonle",
] as const;

export function gamePath(game: GamePath): string {
  return `/${game}`;
}

export function collectionPath(): string {
  return "/collection";
}

export function leaderboardPath(): string {
  return "/leaderboard";
}

export function userCollectionPath(username: string): string {
  return `/user/${encodeURIComponent(username)}`;
}

export function isGamePath(value: string): value is GamePath {
  return (GAME_PATHS as readonly string[]).includes(value);
}
