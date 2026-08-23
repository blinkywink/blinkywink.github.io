/** Guest monkey-card ownership — localStorage only (too large for cookies). */

import {
  needsVisualSeed,
  newVisualSeed,
  parseVisualSeed,
} from "./cardVisualSeed";

const LS_KEY = "bloon-arcade:guest-cards";
const LS_SEEDS = "bloon-arcade:guest-card-seeds";

function uniqIds(ids: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return uniqIds(data.map((x) => String(x)));
  } catch {
    return [];
  }
}

export function loadGuestCardSeeds(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_SEEDS);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
      const seed = parseVisualSeed(value);
      if (seed == null) continue;
      out[id] = seed;
    }
    return out;
  } catch {
    return {};
  }
}

function saveGuestCardSeeds(seeds: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_SEEDS, JSON.stringify(seeds));
  } catch {
    // private mode / quota
  }
}

function ensureGuestSeeds(ids: Iterable<string>): Record<string, number> {
  const seeds = loadGuestCardSeeds();
  let dirty = false;
  for (const id of ids) {
    if (!needsVisualSeed(id) || seeds[id] != null) continue;
    seeds[id] = newVisualSeed();
    dirty = true;
  }
  if (dirty) saveGuestCardSeeds(seeds);
  return seeds;
}

export function loadGuestCardIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const ids = parseIds(window.localStorage.getItem(LS_KEY));
    ensureGuestSeeds(ids);
    return ids;
  } catch {
    return [];
  }
}

export function saveGuestCardIds(ids: Iterable<string>): string[] {
  const next = uniqIds(ids);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // private mode / quota
    }
  }
  return next;
}

/** Adds card ids; returns the full collection and which ids were newly added. */
export function awardGuestCards(ids: Iterable<string>): {
  all: string[];
  added: string[];
} {
  const cur = new Set(loadGuestCardIds());
  const added: string[] = [];
  for (const id of uniqIds(ids)) {
    if (cur.has(id)) continue;
    cur.add(id);
    added.push(id);
  }
  const all = saveGuestCardIds(cur);
  ensureGuestSeeds(all);
  return { all, added };
}

export function clearGuestCards(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_KEY);
    window.localStorage.removeItem(LS_SEEDS);
    window.localStorage.removeItem("bloon-arcade:guest-card-mastered");
  } catch {
    // ignore
  }
}
