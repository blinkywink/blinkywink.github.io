/** Tiny in-memory TTL cache — cuts duplicate fetches while browsing. */

type Entry = {
  value: unknown;
  expires: number;
};

const store = new Map<string, Entry>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + Math.max(0, ttlMs) });
}

/** Drop one key, or every key starting with prefix. */
export function cacheInvalidate(keyOrPrefix?: string): void {
  if (!keyOrPrefix) {
    store.clear();
    return;
  }
  if (store.delete(keyOrPrefix)) return;
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}

/**
 * Return cached value when fresh; otherwise run `load` and store.
 * Pass `force: true` to bypass (after a mutation).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  opts?: { force?: boolean },
): Promise<T> {
  if (!opts?.force) {
    const hit = cacheGet<T>(key);
    if (hit !== undefined) return hit;
  }
  const value = await load();
  cacheSet(key, value, ttlMs);
  return value;
}

export const CacheTtl = {
  listings: 25_000,
  listing: 15_000,
  listingOffers: 8_000,
  inbox: 4_000,
  leaderboard: 45_000,
  playerCards: 60_000,
  profiles: 60_000,
  cardPullCount: 45_000,
} as const;
