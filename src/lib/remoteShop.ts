/** Live featured tower names from desktop-config / latest.json. */
type Listener = () => void;

let featured: string[] | null = null;
const listeners = new Set<Listener>();

export function applyRemoteFeaturedTowers(names: string[] | null | undefined) {
  const next =
    names?.map((n) => String(n).trim()).filter(Boolean).slice(0, 3) ?? [];
  featured = next.length ? next : null;
  for (const fn of listeners) fn();
}

export function getRemoteFeaturedTowers(): string[] | null {
  return featured;
}

export function subscribeRemoteFeatured(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
