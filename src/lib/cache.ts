/** Tiny in-memory TTL cache — cuts duplicate fetches while browsing. */

type Entry = {
  value: unknown;
  expires: number;
};

const store = new Map<string, Entry>();

export type CachedOpts<T> = {
  /** Bypass cache and replace stored value. */
  force?: boolean;
  /** Return stale data immediately, refresh in the background. */
  revalidate?: boolean;
  onRevalidate?: (value: T) => void;
};

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) return undefined;
  return hit.value as T;
}

/** Last stored value even after TTL — for instant paint while revalidating. */
export function cacheGetStale<T>(key: string): T | undefined {
  const hit = store.get(key);
  return hit ? (hit.value as T) : undefined;
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

function revalidateInBackground<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  onRevalidate?: (value: T) => void,
): void {
  void load()
    .then((value) => {
      cacheSet(key, value, ttlMs);
      onRevalidate?.(value);
    })
    .catch(() => undefined);
}

/**
 * Return cached value when fresh; otherwise run `load` and store.
 * With `revalidate`, return stale cache immediately and refresh in the background.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  opts?: CachedOpts<T>,
): Promise<T> {
  if (opts?.force) {
    const value = await load();
    cacheSet(key, value, ttlMs);
    return value;
  }

  const fresh = cacheGet<T>(key);
  if (fresh !== undefined) {
    if (opts?.revalidate) {
      revalidateInBackground(key, ttlMs, load, opts.onRevalidate);
    }
    return fresh;
  }

  const stale = cacheGetStale<T>(key);
  if (stale !== undefined && opts?.revalidate) {
    revalidateInBackground(key, ttlMs, load, opts.onRevalidate);
    return stale;
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
} as const;
