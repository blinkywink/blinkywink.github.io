import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import type { GamePath } from "./routes";
import { GAME_PATHS } from "./routes";

const LS_KEY = "bloon-arcade:account-stats:guest";

export const GAME_STAT_LABELS: Record<GamePath, string> = {
  zoomed: "Zoomed",
  geoguessr: "Geoguessr",
  pricecheck: "Price Check",
  orderup: "Order Up",
  bloonle: "Bloonle",
  camodetection: "Camo Detection",
  bloonssweeper: "Bloons Sweeper",
  bananacatch: "Banana Catch",
  bloonhero: "Bloon Hero",
  roundcheck: "Round Check",
  heliumpop: "Helium Pop",
  blowfree: "Blow Free",
};

export type AccountStats = {
  gamesPlayed: number;
  gamesWon: number;
  packsOpened: number;
  packsPurchased: number;
  tradesCompleted: number;
  exchangesCompleted: number;
  cardsPulled: number;
  paragonsPulled: number;
  /** Per-game play counts for favorite game. */
  gamePlays: Partial<Record<GamePath, number>>;
};

export const EMPTY_ACCOUNT_STATS: AccountStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  packsOpened: 0,
  packsPurchased: 0,
  tradesCompleted: 0,
  exchangesCompleted: 0,
  cardsPulled: 0,
  paragonsPulled: 0,
  gamePlays: {},
};

function isGamePath(v: string): v is GamePath {
  return (GAME_PATHS as readonly string[]).includes(v);
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
  if (typeof v === "string" && Number.isFinite(Number(v))) {
    const n = Math.floor(Number(v));
    return n > 0 ? n : 0;
  }
  return 0;
}

export function parseAccountStats(raw: unknown): AccountStats {
  const out: AccountStats = { ...EMPTY_ACCOUNT_STATS, gamePlays: {} };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  out.gamesPlayed = num(obj.gamesPlayed);
  out.gamesWon = num(obj.gamesWon);
  out.packsOpened = num(obj.packsOpened);
  out.packsPurchased = num(obj.packsPurchased);
  out.tradesCompleted = num(obj.tradesCompleted);
  out.exchangesCompleted = num(obj.exchangesCompleted);
  out.cardsPulled = num(obj.cardsPulled);
  out.paragonsPulled = num(obj.paragonsPulled);
  const plays = obj.gamePlays;
  if (plays && typeof plays === "object" && !Array.isArray(plays)) {
    for (const [k, v] of Object.entries(plays as Record<string, unknown>)) {
      if (!isGamePath(k)) continue;
      const n = num(v);
      if (n > 0) out.gamePlays[k] = n;
    }
  }
  return out;
}

function readGuest(): AccountStats {
  if (typeof window === "undefined") return { ...EMPTY_ACCOUNT_STATS, gamePlays: {} };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { ...EMPTY_ACCOUNT_STATS, gamePlays: {} };
    return parseAccountStats(JSON.parse(raw));
  } catch {
    return { ...EMPTY_ACCOUNT_STATS, gamePlays: {} };
  }
}

function writeGuest(stats: AccountStats): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

function signedIn(): boolean {
  return Boolean(getAccessToken() && loadAppSession()?.userId);
}

async function bump(
  delta: Partial<
    Pick<
      AccountStats,
      | "gamesPlayed"
      | "gamesWon"
      | "packsOpened"
      | "packsPurchased"
      | "tradesCompleted"
      | "exchangesCompleted"
      | "cardsPulled"
      | "paragonsPulled"
    >
  >,
  gameId?: GamePath | null,
): Promise<AccountStats | null> {
  if (!signedIn()) {
    const cur = readGuest();
    const next: AccountStats = {
      ...cur,
      gamePlays: { ...cur.gamePlays },
      gamesPlayed: cur.gamesPlayed + (delta.gamesPlayed ?? 0),
      gamesWon: cur.gamesWon + (delta.gamesWon ?? 0),
      packsOpened: cur.packsOpened + (delta.packsOpened ?? 0),
      packsPurchased: cur.packsPurchased + (delta.packsPurchased ?? 0),
      tradesCompleted: cur.tradesCompleted + (delta.tradesCompleted ?? 0),
      exchangesCompleted:
        cur.exchangesCompleted + (delta.exchangesCompleted ?? 0),
      cardsPulled: cur.cardsPulled + (delta.cardsPulled ?? 0),
      paragonsPulled: cur.paragonsPulled + (delta.paragonsPulled ?? 0),
    };
    if (gameId) {
      next.gamePlays[gameId] = (next.gamePlays[gameId] ?? 0) + 1;
    }
    writeGuest(next);
    return next;
  }

  const payload: Record<string, number> = {};
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === "number" && v > 0) payload[k] = Math.floor(v);
  }
  const { data, error } = await supabase.rpc("bump_account_stats", {
    p_delta: payload,
    p_game_id: gameId ?? null,
  });
  if (error) {
    console.warn("bump_account_stats failed", error.message);
    return null;
  }
  return parseAccountStats(data);
}

/** Finished a game run (win or lose). */
export async function recordGameRun(
  game: GamePath,
  cleared: boolean,
): Promise<void> {
  await bump(
    {
      gamesPlayed: 1,
      gamesWon: cleared ? 1 : 0,
    },
    game,
  );
}

/** Pack reveal finished / cards drawn. */
export async function recordPackOpened(opts: {
  purchased: boolean;
  cardsPulled?: number;
  paragonsPulled?: number;
}): Promise<void> {
  await bump({
    packsOpened: 1,
    packsPurchased: opts.purchased ? 1 : 0,
    cardsPulled: Math.max(0, opts.cardsPulled ?? 0),
    paragonsPulled: Math.max(0, opts.paragonsPulled ?? 0),
  });
}

export async function recordTradeCompleted(): Promise<void> {
  await bump({ tradesCompleted: 1 });
}

export async function recordExchangeCompleted(): Promise<void> {
  await bump({ exchangesCompleted: 1 });
}

export async function fetchAccountStats(): Promise<AccountStats> {
  if (!signedIn()) return readGuest();
  const { data, error } = await supabase.rpc("get_account_stats");
  if (error) {
    console.warn("get_account_stats failed", error.message);
    return { ...EMPTY_ACCOUNT_STATS, gamePlays: {} };
  }
  return parseAccountStats(data);
}

export type PublicAccountStatsBundle = {
  stats: AccountStats;
  coinsEarned: number;
  shopSpent: number;
  ownedHeroIds: string[];
};

/** Another player's synced stats (collection counts come from their card list). */
export async function fetchPublicAccountStats(
  username: string,
): Promise<PublicAccountStatsBundle | null> {
  const raw = String(username ?? "").trim();
  if (!raw) return null;
  const { data, error } = await supabase.rpc("get_public_account_stats", {
    p_username: raw,
  });
  if (error) {
    console.warn("get_public_account_stats failed", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const heroes = Array.isArray(obj.ownedHeroIds)
    ? obj.ownedHeroIds.map(String)
    : [];
  return {
    stats: parseAccountStats(obj.accountStats),
    coinsEarned: num(obj.coinsEarned),
    shopSpent: num(obj.shopSpent),
    ownedHeroIds: heroes,
  };
}

/** Most-played games, highest count first (ties keep GAME_PATHS order). */
export function topPlayedGames(
  gamePlays: Partial<Record<GamePath, number>>,
  limit = 3,
): GamePath[] {
  const n = Math.max(0, Math.floor(limit));
  if (n <= 0) return [];
  return [...GAME_PATHS]
    .filter((id) => (gamePlays[id] ?? 0) > 0)
    .sort((a, b) => (gamePlays[b] ?? 0) - (gamePlays[a] ?? 0))
    .slice(0, n);
}

export function favoriteGameFromStats(
  stats: AccountStats,
): { id: GamePath; label: string; plays: number } | null {
  const top = topPlayedGames(stats.gamePlays, 1);
  const best = top[0];
  if (!best) return null;
  return {
    id: best,
    label: GAME_STAT_LABELS[best],
    plays: stats.gamePlays[best] ?? 0,
  };
}

/** Guest LS, or profile blob when signed in / provided. */
export function readAccountStatsLocal(profileStats?: unknown): AccountStats {
  if (profileStats != null) return statsFromProfile(profileStats);
  if (signedIn()) return { ...EMPTY_ACCOUNT_STATS, gamePlays: {} };
  return readGuest();
}

export function statsFromProfile(raw: unknown): AccountStats {
  return parseAccountStats(raw);
}
