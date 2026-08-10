import { GAME_PATHS, type GamePath } from "./routes";

export const FEATURED_BONUS_CASH = 500;

const LS_KEY = "bloon-arcade:featured-bonus-game";
/** Fired whenever the featured bonus game id changes (same tab). */
export const FEATURED_BONUS_CHANGED = "bloon-arcade:featured-bonus-changed";

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
  try {
    window.dispatchEvent(
      new CustomEvent(FEATURED_BONUS_CHANGED, { detail: game }),
    );
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
 * Resolve after any finished run.
 * Always rotates the featured glow (unless Silas holds it).
 * Awards +500 only when the run cleared the current featured game.
 */
export function resolveFeaturedBonusGame(
  played: FeaturedBonusGame,
  cleared: boolean,
  opts: { silasHoldChance?: number; silasFreezeChance?: number } = {},
): {
  awarded: boolean;
  amount: number;
  next: FeaturedBonusGame | null;
  silasHeld?: boolean;
  /** @deprecated alias of silasHeld */
  silasFroze?: boolean;
} {
  const featured = getOrCreateFeaturedBonusGame();
  const wasFeaturedClear = cleared && played === featured;

  const holdChance = opts.silasHoldChance ?? opts.silasFreezeChance ?? 0;
  const held = holdChance > 0 && Math.random() < holdChance;
  const next = held ? featured : pickRandom(featured);
  if (!held) writeFeaturedBonusGame(next);

  if (!wasFeaturedClear) {
    return {
      awarded: false,
      amount: 0,
      next,
      silasHeld: held,
      silasFroze: held,
    };
  }

  return {
    awarded: true,
    amount: FEATURED_BONUS_CASH,
    next,
    silasHeld: held,
    silasFroze: held,
  };
}
