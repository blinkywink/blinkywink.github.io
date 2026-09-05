import { GAME_PATHS, type GamePath } from "./routes";

export const FEATURED_BONUS_CASH = 500;

const LS_KEY = "bloon-arcade:featured-bonus-game";
/** Fired whenever the featured bonus game id changes (same tab). */
export const FEATURED_BONUS_CHANGED = "bloon-arcade:featured-bonus-changed";

export type FeaturedBonusGame = GamePath;

const POOL: readonly FeaturedBonusGame[] = GAME_PATHS;

/** Quiz / 10-round games: clear the run, or get at least half right. */
export const FEATURED_QUIZ_DECENT_CORRECT = 5;
/** Banana Catch: solid haul without needing the pack-clear bar. */
export const FEATURED_BANANA_DECENT = 12;
/** Camo Detection: survive this many answered rounds. */
export const FEATURED_CAMO_DECENT_ROUNDS = 5;
/** Round Check / Helium Pop: this many solves in the run. */
export const FEATURED_SOLVE_DECENT = 2;

function isGameId(v: string): v is FeaturedBonusGame {
  return (POOL as readonly string[]).includes(v);
}

function asExcludeSet(
  exclude?: FeaturedBonusGame | null | readonly FeaturedBonusGame[],
): Set<FeaturedBonusGame> {
  if (exclude == null) return new Set();
  if (typeof exclude === "string") return new Set([exclude]);
  return new Set(exclude);
}

function pickRandom(
  bag: readonly FeaturedBonusGame[],
  exclude?: FeaturedBonusGame | null | readonly FeaturedBonusGame[],
): FeaturedBonusGame {
  const ban = asExcludeSet(exclude);
  const filtered = ban.size ? bag.filter((g) => !ban.has(g)) : [...bag];
  const list = filtered.length ? filtered : [...bag];
  const fallback = list.length ? list : [...POOL];
  return fallback[Math.floor(Math.random() * fallback.length)]!;
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

/**
 * Current glowing bonus game - creates one if missing.
 * Pass `exclude` to skip no-Cash / spam-locked games (rotates if current is banned).
 */
export function getOrCreateFeaturedBonusGame(
  exclude: readonly FeaturedBonusGame[] = [],
): FeaturedBonusGame {
  const ban = asExcludeSet(exclude);
  const cur = readFeaturedBonusGame();
  if (cur && !ban.has(cur)) return cur;
  const next = pickRandom(POOL, cur ? [...ban, cur] : [...ban]);
  if (next !== cur) writeFeaturedBonusGame(next);
  return next;
}

export function featuredDidDecentQuiz(
  cleared: boolean,
  correctCount: number,
): boolean {
  return cleared || correctCount >= FEATURED_QUIZ_DECENT_CORRECT;
}

export function featuredDidDecentBanana(bananas: number): boolean {
  return bananas >= FEATURED_BANANA_DECENT;
}

export function featuredDidDecentCamo(
  cleared: boolean,
  answeredRounds: number,
): boolean {
  return cleared || answeredRounds >= FEATURED_CAMO_DECENT_ROUNDS;
}

export function featuredDidDecentSolves(
  cleared: boolean,
  solves: number,
): boolean {
  return cleared || solves >= FEATURED_SOLVE_DECENT;
}

/** Bloon Hero: finishing the chart counts; early death does not. */
export function featuredDidDecentHero(cleared: boolean): boolean {
  return cleared;
}

/** Win/lose boards (sweeper, dailies): only a win is decent. */
export function featuredDidDecentWin(cleared: boolean): boolean {
  return cleared;
}

/**
 * Resolve after a finished run.
 *
 * - Award +500 when you did decent on the current featured game.
 * - Rotate when you beat the featured game, finish any *other* game, or
 *   burn a one-shot daily attempt (win or lose). Weak fails on the featured
 *   quiz leave it in place so you can retry.
 * - Silas may steer the next pick into your top played games.
 */
export function resolveFeaturedBonusGame(
  played: FeaturedBonusGame,
  didDecent: boolean,
  opts: {
    /** Daily one-shot: rotate even on a failed attempt. */
    oneShotAttempt?: boolean;
    silasFavoriteChance?: number;
    /** @deprecated use silasFavoriteChance */
    silasHoldChance?: number;
    /** @deprecated use silasFavoriteChance */
    silasFreezeChance?: number;
    favoriteGames?: readonly FeaturedBonusGame[];
    /** Games that must not become the next featured bonus (e.g. no-Cash locks). */
    exclude?: readonly FeaturedBonusGame[];
  } = {},
): {
  awarded: boolean;
  amount: number;
  next: FeaturedBonusGame | null;
  silasSteered?: boolean;
  /** @deprecated alias of silasSteered */
  silasHeld?: boolean;
  /** @deprecated alias of silasSteered */
  silasFroze?: boolean;
} {
  const featured = getOrCreateFeaturedBonusGame(opts.exclude ?? []);
  const banned = asExcludeSet(opts.exclude);
  const awarded =
    didDecent && played === featured && !banned.has(played);
  const shouldRotate =
    awarded ||
    played !== featured ||
    Boolean(opts.oneShotAttempt) ||
    banned.has(featured);

  if (!shouldRotate) {
    return {
      awarded: false,
      amount: 0,
      next: featured,
      silasSteered: false,
      silasHeld: false,
      silasFroze: false,
    };
  }

  const steerChance =
    opts.silasFavoriteChance ??
    opts.silasHoldChance ??
    opts.silasFreezeChance ??
    0;
  const favorites = (opts.favoriteGames ?? []).filter(isGameId);
  const steered =
    steerChance > 0 &&
    favorites.length > 0 &&
    Math.random() < steerChance;

  const avoid = opts.exclude?.length
    ? [...opts.exclude, featured]
    : featured;

  const next = steered
    ? pickRandom(favorites, avoid)
    : pickRandom(POOL, avoid);

  if (next !== featured) writeFeaturedBonusGame(next);

  return {
    awarded,
    amount: awarded ? FEATURED_BONUS_CASH : 0,
    next,
    silasSteered: steered,
    silasHeld: steered,
    silasFroze: steered,
  };
}
