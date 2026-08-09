import { GAME_PATHS, type GamePath } from "./routes";

export const FEATURED_BONUS_CASH = 500;

const LS_KEY = "bloon-arcade:featured-bonus-game";

export type FeaturedBonusGame = GamePath;

const POOL: readonly FeaturedBonusGame[] = GAME_PATHS;

function isGameId(v: string): v is FeaturedBonusGame {
  return (POOL as readonly string[]).includes(v);
}

function pickRandom(exclude?: FeaturedBonusGame | null): FeaturedBonusGame {
  const bag = exclude ? POOL.filter((g) => g !== exclude) : [...POOL];
  const list = bag.length ? bag : [...POOL];
  return list[Math.floor(Math.random() * list.length)]!;
}

export function readFeaturedBonusGame(): FeaturedBonusGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw && isGameId(raw)) return raw;
  } catch {
    // ignore
  }
  return null;
}

function writeFeaturedBonusGame(game: FeaturedBonusGame): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, game);
  } catch {
    // ignore
  }
}

/** Current glowing bonus game — creates one if missing. */
export function getOrCreateFeaturedBonusGame(): FeaturedBonusGame {
  const cur = readFeaturedBonusGame();
  if (cur) return cur;
  const next = pickRandom();
  writeFeaturedBonusGame(next);
  return next;
}

/**
 * Resolve playing the featured game.
 * Win → pay +500 and rotate. Lose → rotate with no bonus.
 * Playing a different game does nothing.
 */
export function resolveFeaturedBonusGame(
  played: FeaturedBonusGame,
  cleared: boolean,
): { awarded: boolean; amount: number; next: FeaturedBonusGame | null } {
  const featured = getOrCreateFeaturedBonusGame();
  if (played !== featured) {
    return { awarded: false, amount: 0, next: featured };
  }
  const next = pickRandom(featured);
  writeFeaturedBonusGame(next);
  if (cleared) {
    return { awarded: true, amount: FEATURED_BONUS_CASH, next };
  }
  return { awarded: false, amount: 0, next };
}
