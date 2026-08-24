/** Route enter hooks - background refresh without busting in-memory cache. */

const routeEnterListeners = new Set<(pathname: string) => void>();

export function subscribeRouteEnter(
  fn: (pathname: string) => void,
): () => void {
  routeEnterListeners.add(fn);
  return () => {
    routeEnterListeners.delete(fn);
  };
}

export function notifyRouteEnter(pathname: string): void {
  for (const fn of routeEnterListeners) fn(pathname);
}
