import {
  mergeParagonStates,
  normalizeParagonState,
  type ParagonState,
} from "./paragonProgress";

const LS_KEY = "bloon-arcade:guest-paragons";

export type ParagonMap = Record<string, ParagonState>;

function parseMap(raw: string | null | undefined): ParagonMap {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: ParagonMap = {};
    for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
      const cardId = String(id ?? "").trim();
      if (!cardId.endsWith("-paragon")) continue;
      if (!value || typeof value !== "object") continue;
      out[cardId] = normalizeParagonState(value as ParagonState);
    }
    return out;
  } catch {
    return {};
  }
}

export function loadGuestParagons(): ParagonMap {
  if (typeof window === "undefined") return {};
  try {
    return parseMap(window.localStorage.getItem(LS_KEY));
  } catch {
    return {};
  }
}

export function saveGuestParagons(map: ParagonMap): ParagonMap {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(map));
    } catch {
      // private mode / quota
    }
  }
  return map;
}

export function clearGuestParagons(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

export function setGuestParagon(
  cardId: string,
  state: ParagonState,
): ParagonMap {
  const next = { ...loadGuestParagons(), [cardId]: normalizeParagonState(state) };
  return saveGuestParagons(next);
}

export function mergeGuestParagonMaps(a: ParagonMap, b: ParagonMap): ParagonMap {
  const next: ParagonMap = { ...a };
  for (const [id, state] of Object.entries(b)) {
    next[id] = next[id] ? mergeParagonStates(next[id]!, state) : state;
  }
  return next;
}
