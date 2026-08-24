import { loadAppSession } from "../auth/session";
import { getAccessToken, supabase } from "./supabase";
import {
  feedForCardId,
  freshParagonState,
  mergeParagonStates,
  normalizeParagonState,
  previewParagonFeeds,
  type ParagonApplyResult,
  type ParagonFeed,
  type ParagonState,
} from "./paragonProgress";
import {
  loadGuestParagons,
  saveGuestParagons,
  setGuestParagon,
  type ParagonMap,
} from "./guestParagons";
import { cached, cacheInvalidate, CacheTtl } from "./cache";

type PendingFeed = { card_id: string; xp: number; degrees: number };

const pendingKey = (userId: string) =>
  `bloon-arcade:paragons:pending:${userId}`;

function loadPendingFeeds(userId: string): PendingFeed[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(pendingKey(userId));
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((row) => {
        const rec = row as PendingFeed;
        const card_id = String(rec.card_id ?? "").trim();
        const xp = Math.max(0, Number(rec.xp) || 0);
        const degrees = Math.max(0, Number(rec.degrees) || 0);
        if (!card_id.endsWith("-paragon") || (xp <= 0 && degrees <= 0)) {
          return null;
        }
        return { card_id, xp, degrees };
      })
      .filter((row): row is PendingFeed => Boolean(row));
  } catch {
    return [];
  }
}

function savePendingFeeds(userId: string, feeds: PendingFeed[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!feeds.length) {
      window.localStorage.removeItem(pendingKey(userId));
    } else {
      window.localStorage.setItem(pendingKey(userId), JSON.stringify(feeds));
    }
  } catch {
    // ignore
  }
}

function queuePendingFeeds(userId: string, feeds: PendingFeed[]): void {
  savePendingFeeds(userId, [...loadPendingFeeds(userId), ...feeds]);
}

async function flushPendingFeeds(userId: string): Promise<boolean> {
  const pending = loadPendingFeeds(userId);
  if (!pending.length) return true;
  const { data, error } = await supabase.rpc("apply_paragon_feeds", {
    p_feeds: pending,
  });
  if (error) {
    console.warn("apply_paragon_feeds flush failed", error.message);
    return false;
  }
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }
  savePendingFeeds(userId, []);
  cacheInvalidate("player-paragons:");
  return true;
}

function asStateMap(
  rows: { card_id?: string; cardId?: string; degree?: number; xp?: number }[],
): ParagonMap {
  const out: ParagonMap = {};
  for (const row of rows) {
    const id = String(row.card_id ?? row.cardId ?? "").trim();
    if (!id) continue;
    out[id] = normalizeParagonState(row);
  }
  return out;
}

/** `null` means the server read failed - keep whatever the UI already has. */
export async function fetchOwnParagons(): Promise<ParagonMap | null> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    return loadGuestParagons();
  }

  await flushPendingFeeds(app.userId);

  const { data, error } = await supabase.rpc("get_player_paragons", {
    p_user_id: app.userId,
  });
  if (error) {
    console.warn("get_player_paragons (self) failed", error.message);
    return null;
  }
  return Array.isArray(data) ? asStateMap(data) : {};
}

export async function fetchPlayerParagons(
  userId: string,
  opts?: { force?: boolean },
): Promise<ParagonMap> {
  const id = String(userId ?? "").trim();
  if (!id) return {};
  return cached(
    `player-paragons:${id}`,
    CacheTtl.playerCards,
    async () => {
      const { data, error } = await supabase.rpc("get_player_paragons", {
        p_user_id: id,
      });
      if (error) {
        console.warn("get_player_paragons failed", error.message);
        return {};
      }
      return Array.isArray(data) ? asStateMap(data) : {};
    },
    { force: opts?.force },
  );
}

export async function ensureParagonStates(
  cardIds: string[],
  current: ParagonMap,
): Promise<ParagonMap> {
  const paragons = cardIds.filter((id) => id.endsWith("-paragon"));
  if (!paragons.length) return current;
  const next = { ...current };
  let changed = false;
  for (const id of paragons) {
    if (next[id]) continue;
    next[id] = freshParagonState();
    changed = true;
  }
  if (!changed) return current;

  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    return saveGuestParagons(next);
  }
  return next;
}

export async function applyParagonFeeds(
  feeds: ParagonFeed[],
  ownedParagonIds: ReadonlySet<string>,
  current: ParagonMap,
): Promise<{ map: ParagonMap; results: ParagonApplyResult[] }> {
  const preview = previewParagonFeeds(feeds, ownedParagonIds, current);
  if (!preview.results.length) return preview;

  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    return { map: saveGuestParagons(preview.map), results: preview.results };
  }

  const mergedPayload = new Map<string, { xp: number; degrees: number }>();
  for (const feed of feeds) {
    if (!ownedParagonIds.has(feed.paragonId)) continue;
    const prev = mergedPayload.get(feed.paragonId) ?? { xp: 0, degrees: 0 };
    mergedPayload.set(feed.paragonId, {
      xp: prev.xp + Math.max(0, feed.xp),
      degrees: prev.degrees + Math.max(0, feed.degrees),
    });
  }
  const rpcPayload = [...mergedPayload.entries()].map(([card_id, gain]) => ({
    card_id,
    xp: gain.xp,
    degrees: gain.degrees,
  }));
  const { data, error } = await supabase.rpc("apply_paragon_feeds", {
    p_feeds: rpcPayload,
  });
  if (error) {
    console.warn("apply_paragon_feeds failed", error.message);
    queuePendingFeeds(app.userId, rpcPayload);
    return preview;
  }

  await flushPendingFeeds(app.userId);
  cacheInvalidate("player-paragons:");

  if (!Array.isArray(data) || data.length === 0) {
    // RPC skipped (paragon row not owned yet) - keep local XP and retry later.
    queuePendingFeeds(app.userId, rpcPayload);
    return preview;
  }

  const next = { ...preview.map };
  const results: ParagonApplyResult[] = [];
  for (const row of data as {
    card_id?: string;
    degree?: number;
    xp?: number;
    xp_gained?: number;
    degrees_gained?: number;
  }[]) {
    const cardId = String(row.card_id ?? "").trim();
    if (!cardId) continue;
    const state = normalizeParagonState(row);
    next[cardId] = state;
    results.push({
      cardId,
      ...state,
      xpGained: Number(row.xp_gained ?? 0),
      degreesGained: Number(row.degrees_gained ?? 0),
    });
  }
  return { map: next, results: results.length ? results : preview.results };
}

function resultsFromRpc(
  data: unknown,
  preview: { map: ParagonMap; results: ParagonApplyResult[] },
): { map: ParagonMap; results: ParagonApplyResult[] } {
  if (!Array.isArray(data) || data.length === 0) {
    return preview;
  }
  const next = { ...preview.map };
  const results: ParagonApplyResult[] = [];
  for (const row of data as {
    card_id?: string;
    degree?: number;
    xp?: number;
    xp_gained?: number;
    degrees_gained?: number;
  }[]) {
    const cardId = String(row.card_id ?? "").trim();
    if (!cardId) continue;
    const state = normalizeParagonState(row);
    next[cardId] = state;
    results.push({
      cardId,
      ...state,
      xpGained: Number(row.xp_gained ?? 0),
      degreesGained: Number(row.degrees_gained ?? 0),
    });
  }
  return { map: next, results: results.length ? results : preview.results };
}

/** Persist XP from pulled/bought card ids. Server computes amounts. */
export async function feedParagonsFromCards(
  cardIds: string[],
  newIds: string[],
  ownedParagonIds: ReadonlySet<string>,
  current: ParagonMap,
): Promise<{ map: ParagonMap; results: ParagonApplyResult[] }> {
  const ids = [...new Set(cardIds.map((id) => String(id).trim()).filter(Boolean))];
  const unlocked = [...new Set(newIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return { map: current, results: [] };

  const unlockedSet = new Set(unlocked);
  const feeds: ParagonFeed[] = [];
  for (const id of ids) {
    if (unlockedSet.has(id)) continue;
    const feed = feedForCardId(id);
    if (!feed || !ownedParagonIds.has(feed.paragonId)) continue;
    feeds.push(feed);
  }
  const preview = previewParagonFeeds(feeds, ownedParagonIds, current);
  if (!preview.results.length && !ids.length) return preview;

  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    if (!preview.results.length) return preview;
    return { map: saveGuestParagons(preview.map), results: preview.results };
  }

  const pendingPayload = [...feeds.reduce((map, feed) => {
    const prev = map.get(feed.paragonId) ?? { xp: 0, degrees: 0 };
    map.set(feed.paragonId, {
      xp: prev.xp + Math.max(0, feed.xp),
      degrees: prev.degrees + Math.max(0, feed.degrees),
    });
    return map;
  }, new Map<string, { xp: number; degrees: number }>())].map(
    ([card_id, gain]) => ({ card_id, xp: gain.xp, degrees: gain.degrees }),
  );

  const { data, error } = await supabase.rpc("feed_paragons_from_cards", {
    p_card_ids: ids,
    p_new_ids: unlocked,
  });
  if (error) {
    console.warn("feed_paragons_from_cards failed", error.message);
    if (pendingPayload.length) queuePendingFeeds(app.userId, pendingPayload);
    return preview.results.length ? preview : { map: current, results: [] };
  }

  await flushPendingFeeds(app.userId);
  cacheInvalidate("player-paragons:");

  if (!Array.isArray(data) || data.length === 0) {
    if (pendingPayload.length) queuePendingFeeds(app.userId, pendingPayload);
    return preview.results.length ? preview : { map: current, results: [] };
  }

  return resultsFromRpc(data, preview.results.length ? preview : { map: current, results: [] });
}

export async function importParagonProgress(map: ParagonMap): Promise<ParagonMap> {
  const rows = Object.entries(map).map(([card_id, state]) => ({
    card_id,
    degree: state.degree,
    xp: state.xp,
  }));
  if (!rows.length) return {};
  const { data, error } = await supabase.rpc("import_paragon_progress", {
    p_rows: rows,
  });
  if (error) {
    console.warn("import_paragon_progress failed", error.message);
    return map;
  }
  return Array.isArray(data) ? asStateMap(data) : map;
}

export function mergeImportedParagons(
  current: ParagonMap,
  incoming: ParagonMap,
): ParagonMap {
  const next = { ...current };
  for (const [id, state] of Object.entries(incoming)) {
    next[id] = next[id] ? mergeParagonStates(next[id]!, state) : state;
  }
  return next;
}

export function dropParagonLocal(cardId: string, current: ParagonMap): ParagonMap {
  if (!current[cardId]) return current;
  const next = { ...current };
  delete next[cardId];
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    return saveGuestParagons(next);
  }
  cacheInvalidate("player-paragons:");
  return next;
}

export function setParagonLocal(
  cardId: string,
  state: ParagonState,
  current: ParagonMap,
): ParagonMap {
  const next = { ...current, [cardId]: normalizeParagonState(state) };
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    return setGuestParagon(cardId, state);
  }
  return next;
}
