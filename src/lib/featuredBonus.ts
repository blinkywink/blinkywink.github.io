import { GAME_PATHS, type GamePath } from "./routes";

export const FEATURED_BONUS_CASH = 500;

const LS_KEY = "bloon-arcade:featured-bonus-game";
const SILAS_FREEZE_KEY = "bloon-arcade:featured-bonus-silas-freeze";
const SILAS_DAY_KEY = "bloon-arcade:featured-bonus-silas-day";

export type FeaturedBonusGame = GamePath;

const POOL: readonly FeaturedBonusGame[] = GAME_PATHS;

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function silasFreezeArmed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(SILAS_DAY_KEY) !== utcDay()) return false;
    return window.localStorage.getItem(SILAS_FREEZE_KEY) === "1";
  } catch {
    return false;
  }
}

function armSilasFreeze(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SILAS_DAY_KEY, utcDay());
    window.localStorage.setItem(SILAS_FREEZE_KEY, "1");
  } catch {
    // ignore
  }
}

function clearSilasFreeze(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SILAS_FREEZE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Resolve playing the featured game.
 * Win → pay +500 and rotate. Lose → rotate with no bonus.
 * Playing a different game does nothing.
 *
 * Silas: when `silasFreezeChance` procs after a clear, keep the same featured
 * game so it can award once more that day.
 */
export function resolveFeaturedBonusGame(
  played: FeaturedBonusGame,
  cleared: boolean,
  opts: { silasFreezeChance?: number } = {},
): {
  awarded: boolean;
  amount: number;
  next: FeaturedBonusGame | null;
  silasFroze?: boolean;
} {
  const featured = getOrCreateFeaturedBonusGame();
  if (played !== featured) {
    return { awarded: false, amount: 0, next: featured };
  }

  if (!cleared) {
    clearSilasFreeze();
    const next = pickRandom(featured);
    writeFeaturedBonusGame(next);
    return { awarded: false, amount: 0, next };
  }

  // Second claim of a Silas-frozen featured day.
  if (silasFreezeArmed()) {
    clearSilasFreeze();
    const next = pickRandom(featured);
    writeFeaturedBonusGame(next);
    return {
      awarded: true,
      amount: FEATURED_BONUS_CASH,
      next,
      silasFroze: false,
    };
  }

  const chance = opts.silasFreezeChance ?? 0;
  if (chance > 0 && Math.random() < chance) {
    armSilasFreeze();
    return {
      awarded: true,
      amount: FEATURED_BONUS_CASH,
      next: featured,
      silasFroze: true,
    };
  }

  const next = pickRandom(featured);
  writeFeaturedBonusGame(next);
  return { awarded: true, amount: FEATURED_BONUS_CASH, next };
}
