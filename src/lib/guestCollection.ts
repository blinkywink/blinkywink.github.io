/** Guest monkey-card ownership — localStorage only (too large for cookies). */

const LS_KEY = "bloon-arcade:guest-cards";

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

export function loadGuestCardIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseIds(window.localStorage.getItem(LS_KEY));
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
  return { all: saveGuestCardIds(cur), added };
}

export function clearGuestCards(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}
