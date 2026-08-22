import {
  awardGuestCards,
  loadGuestCardIds,
  loadGuestCardSeeds,
} from "./guestCollection";
import { cached, CacheTtl } from "./cache";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { parseVisualSeed } from "./cardVisualSeed";

export type OwnedCardCopy = {
  cardId: string;
  visualSeed: number | null;
};

function copiesFromIds(
  ids: Iterable<string>,
  seeds: Record<string, number> = {},
): OwnedCardCopy[] {
  return [...new Set([...ids].map(String))].map((cardId) => ({
    cardId,
    visualSeed: parseVisualSeed(seeds[cardId]),
  }));
}

function parseCopies(raw: unknown): OwnedCardCopy[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (typeof row === "string") {
        return { cardId: row, visualSeed: null };
      }
      const r = row as Record<string, unknown>;
      const cardId = String(r.cardId ?? r.card_id ?? "").trim();
      if (!cardId) return null;
      return {
        cardId,
        visualSeed: parseVisualSeed(r.visualSeed ?? r.visual_seed),
      };
    })
    .filter((row): row is OwnedCardCopy => Boolean(row));
}

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
async function fetchOwnedCopiesFromTable(
  userId: string,
): Promise<OwnedCardCopy[]> {
  const pageSize = 1000;
  const copies: OwnedCardCopy[] = [];
  for (let from = 0; ; from += pageSize) {
    const first = await supabase
      .from("owned_cards")
      .select("card_id, visual_seed")
      .eq("user_id", userId)
      .range(from, from + pageSize - 1);

    const result = first.error
      ? await supabase
          .from("owned_cards")
          .select("card_id")
          .eq("user_id", userId)
          .range(from, from + pageSize - 1)
      : first;

    if (result.error) throw new Error(result.error.message);

    const batch = parseCopies(result.data ?? []);
    copies.push(...batch);
    if (batch.length < pageSize) break;
  }
  return copies;
}

async function fetchCopiesViaRpc(userId: string): Promise<OwnedCardCopy[]> {
  const copies = await supabase.rpc("get_player_card_copies", {
    p_user_id: userId,
  });
  if (!copies.error && copies.data != null) {
    return parseCopies(copies.data);
  }

  const ids = await supabase.rpc("get_player_cards", {
    p_user_id: userId,
  });
  if (ids.error) throw new Error(ids.error.message);
  if (!Array.isArray(ids.data)) return [];
  return copiesFromIds(ids.data.map(String));
}

/** Load owned card copies for the current session. */
export async function fetchOwnedCopies(): Promise<OwnedCardCopy[]> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    const ids = loadGuestCardIds();
    return copiesFromIds(ids, loadGuestCardSeeds());
  }

  // Re-apply any awards that never made it to the server (network / RPC blip).
  await flushPendingAwards(app.userId);

  let server: OwnedCardCopy[] = [];
  try {
    server = await fetchCopiesViaRpc(app.userId);
  } catch (err) {
    console.warn(
      "get_player_card_copies (self) failed",
      err instanceof Error ? err.message : err,
    );
    try {
      server = await fetchOwnedCopiesFromTable(app.userId);
    } catch (tableErr) {
      console.warn(
        "owned_cards fetch failed",
        tableErr instanceof Error ? tableErr.message : tableErr,
      );
      const pending = loadPendingAwards(app.userId);
      return copiesFromIds(
        [...loadUserLocalCards(app.userId), ...pending],
      );
    }
  }

  const pending = loadPendingAwards(app.userId);
  const merged = new Map(server.map((row) => [row.cardId, row]));
  for (const id of pending) {
    if (!merged.has(id)) merged.set(id, { cardId: id, visualSeed: null });
  }
  const copies = [...merged.values()];
  saveUserLocalCards(
    app.userId,
    copies.map((row) => row.cardId),
  );
  return copies;
}

/** Load owned card ids for the current session. */
export async function fetchOwnedCardIds(): Promise<string[]> {
  const copies = await fetchOwnedCopies();
  return copies.map((row) => row.cardId);
}

/** Load another player's owned card copies (public leaderboard browse). */
export async function fetchPlayerCardCopies(
  userId: string,
  opts?: { force?: boolean },
): Promise<OwnedCardCopy[]> {
  const id = String(userId ?? "").trim();
  if (!id) return [];

  return cached(
    `player-card-copies:${id}`,
    CacheTtl.playerCards,
    async () => {
      try {
        return await fetchCopiesViaRpc(id);
      } catch (error) {
        console.warn(
          "get_player_card_copies failed",
          error instanceof Error ? error.message : error,
        );
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    { force: opts?.force },
  );
}

/** Load another player's owned card ids (public leaderboard browse). */
export async function fetchPlayerCardIds(userId: string): Promise<string[]> {
  const copies = await fetchPlayerCardCopies(userId);
  return copies.map((row) => row.cardId);
}
