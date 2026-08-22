/** Bust in-memory fetch caches when entering a route (SPA has no browser refresh). */

import { cacheInvalidate } from "./cache";

const routeEnterListeners = new Set<(pathname: string) => void>();

export function subscribeRouteEnter(
  fn: (pathname: string) => void,
): () => void {
  routeEnterListeners.add(fn);
  return () => {
    routeEnterListeners.delete(fn);
  };
}

export function invalidateCachesForRoute(pathname: string): void {
  if (pathname.startsWith("/user/")) {
    cacheInvalidate("profile:");
    cacheInvalidate("player-card-copies:");
    cacheInvalidate("player-paragons:");
  } else if (pathname === "/leaderboard" || pathname === "/") {
    cacheInvalidate("leaderboard:");
  } else if (
    pathname === "/marketplace" ||
    pathname.startsWith("/marketplace/")
  ) {
    cacheInvalidate("market:");
  } else if (pathname === "/collection") {
    cacheInvalidate("player-card-copies:");
    cacheInvalidate("player-paragons:");
  } else if (pathname === "/shop") {
    cacheInvalidate("shop:");
  } else if (pathname === "/profile") {
    cacheInvalidate("profile:");
  }

  for (const fn of routeEnterListeners) fn(pathname);
}
