/** Only one card canvas may animate at a time (Android WebView melts with several). */

let holder: string | null = null;
const waiters = new Set<() => void>();

export function tryHoldAnimatedVisualizer(id: string): boolean {
  if (holder === null || holder === id) {
    holder = id;
    return true;
  }
  return false;
}

export function releaseAnimatedVisualizer(id: string) {
  if (holder !== id) return;
  holder = null;
  for (const fn of waiters) fn();
}

export function onAnimatedVisualizerSlot(fn: () => void) {
  waiters.add(fn);
  return () => {
    waiters.delete(fn);
  };
}
