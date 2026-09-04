/** Cap animated focus visualizers. Preview grids match the website (IO-gated). */

const STATIC_LIMIT = 24;

let animatedHolder: string | null = null;
const animatedWaiters = new Set<() => void>();

const staticHolders = new Set<string>();
const staticWaiters = new Set<() => void>();

export function tryHoldAnimatedVisualizer(id: string): boolean {
  if (animatedHolder === null || animatedHolder === id) {
    animatedHolder = id;
    return true;
  }
  return false;
}

export function releaseAnimatedVisualizer(id: string) {
  if (animatedHolder !== id) return;
  animatedHolder = null;
  for (const fn of animatedWaiters) fn();
}

export function onAnimatedVisualizerSlot(fn: () => void) {
  animatedWaiters.add(fn);
  return () => {
    animatedWaiters.delete(fn);
  };
}

/** Preview grids: match website look with static canvases, but cap concurrent draws in the app. */
export function tryHoldStaticVisualizer(id: string): boolean {
  if (staticHolders.has(id)) return true;
  if (staticHolders.size >= STATIC_LIMIT) return false;
  staticHolders.add(id);
  return true;
}

export function releaseStaticVisualizer(id: string) {
  if (!staticHolders.delete(id)) return;
  for (const fn of staticWaiters) fn();
}

export function onStaticVisualizerSlot(fn: () => void) {
  staticWaiters.add(fn);
  return () => {
    staticWaiters.delete(fn);
  };
}
