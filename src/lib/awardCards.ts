import { awardGuestCards, loadGuestCardIds } from "./guestCollection";
import { cached, CacheTtl } from "./cache";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

const userLsKey = (userId: string) => `bloon-arcade:cards:${userId}`;
const pendingLsKey = (userId: string) =>
  `bloon-arcade:cards:pending:${userId}`;

function loadUserLocalCards(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(userLsKey(userId));
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return [...new Set(data.map(String))];
  } catch {
    return [];
  }
}

function saveUserLocalCards(userId: string, ids: Iterable<string>): string[] {
  const next = [...new Set([...ids].map(String))];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(userLsKey(userId), JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

function loadPendingAwards(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(pendingLsKey(userId));
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return [...new Set(data.map(String).filter((id) => id.length > 0))];
  } catch {
    return [];
  }
}

function savePendingAwards(userId: string, ids: Iterable<string>): void {
  if (typeof window === "undefined") return;
  const next = [...new Set([...ids].map(String).filter((id) => id.length > 0))];
  try {
    if (next.length === 0) {
      window.localStorage.removeItem(pendingLsKey(userId));
    } else {
      window.localStorage.setItem(pendingLsKey(userId), JSON.stringify(next));
    }
  } catch {
    // ignore
  }
}

function addPendingAwards(userId: string, ids: string[]): void {
  const cur = new Set(loadPendingAwards(userId));
  for (const id of ids) cur.add(id);
  savePendingAwards(userId, cur);
}

function clearPendingAwards(userId: string, ids: string[]): void {
  if (!ids.length) return;
  const drop = new Set(ids);
  savePendingAwards(
    userId,
    loadPendingAwards(userId).filter((id) => !drop.has(id)),
  );
}

/** Push any locally pending unlocks to Supabase (best-effort). */
async function flushPendingAwards(userId: string): Promise<string[]> {
  const pending = loadPendingAwards(userId);
  if (!pending.length) return [];

  const { data, error } = await supabase.rpc("award_cards", {
    p_card_ids: pending,
  });

  if (error) {
    console.warn("award_cards flush failed", error.message);
    return [];
  }

  clearPendingAwards(userId, pending);
  return Array.isArray(data) ? data.map(String) : pending;
}

/**
 * Persist newly pulled monkey cards.
 * Guest → localStorage; signed-in → Supabase `award_cards` RPC.
 * Returns card ids that were newly unlocked.
 */
export async function awardCards(cardIds: string[]): Promise<string[]> {
  const ids = [
    ...new Set(
      cardIds.map((id) => String(id ?? "").trim()).filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return [];

  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    return awardGuestCards(ids).added;
  }

  const { data, error } = await supabase.rpc("award_cards", {
    p_card_ids: ids,
  });

  if (error) {
    console.warn("award_cards failed", error.message);
    // Keep a retry queue so Magus / rare pulls can't vanish on refresh.
    addPendingAwards(app.userId, ids);
    const cur = new Set(loadUserLocalCards(app.userId));
    const added: string[] = [];
    for (const id of ids) {
      if (cur.has(id)) continue;
      cur.add(id);
      added.push(id);
    }
    saveUserLocalCards(app.userId, cur);
    return added;
  }

  clearPendingAwards(app.userId, ids);
  const existing = loadUserLocalCards(app.userId);
  saveUserLocalCards(app.userId, [...existing, ...ids]);

  if (Array.isArray(data)) {
    return data.map(String);
  }
  return ids;
}

/** Fetch every owned card id (paginated — PostgREST caps ~1000 rows/request). */
async function fetchOwnedCardIdsFromTable(userId: string): Promise<string[]> {
  const pageSize = 1000;
  const ids: string[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []).map((row) => String(row.card_id));
    ids.push(...batch);
    if (batch.length < pageSize) break;
  }
  return [...new Set(ids)];
}

/** Load owned card ids for the current session. */
export async function fetchOwnedCardIds(): Promise<string[]> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    return loadGuestCardIds();
  }

  // Re-apply any awards that never made it to the server (network / RPC blip).
  await flushPendingAwards(app.userId);

  // Same RPC used for public profiles — returns the full array (no 1000-row cut).
  const { data, error } = await supabase.rpc("get_player_cards", {
    p_user_id: app.userId,
  });

  let serverIds: string[] = [];
  if (error) {
    console.warn("get_player_cards (self) failed", error.message);
    try {
      serverIds = await fetchOwnedCardIdsFromTable(app.userId);
    } catch (tableErr) {
      console.warn(
        "owned_cards fetch failed",
        tableErr instanceof Error ? tableErr.message : tableErr,
      );
      const pending = loadPendingAwards(app.userId);
      return [...new Set([...loadUserLocalCards(app.userId), ...pending])];
    }
  } else if (Array.isArray(data)) {
    serverIds = [...new Set(data.map(String))];
  }

  const pending = loadPendingAwards(app.userId);
  // Show pending unlocks optimistically until flush succeeds next time.
  const merged = [...new Set([...serverIds, ...pending])];
  saveUserLocalCards(app.userId, merged);
  return merged;
}

/** Load another player's owned card ids (public leaderboard browse). */
export async function fetchPlayerCardIds(userId: string): Promise<string[]> {
  const id = String(userId ?? "").trim();
  if (!id) return [];

  return cached(`player-cards:${id}`, CacheTtl.playerCards, async () => {
    const { data, error } = await supabase.rpc("get_player_cards", {
      p_user_id: id,
    });

    if (error) {
      console.warn("get_player_cards failed", error.message);
      throw new Error(error.message);
    }

    if (!Array.isArray(data)) return [];
    return [...new Set(data.map(String))];
  });
}
