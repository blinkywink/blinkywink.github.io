import { awardGuestCards, loadGuestCardIds } from "./guestCollection";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

const userLsKey = (userId: string) => `bloon-arcade:cards:${userId}`;

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

  const existing = loadUserLocalCards(app.userId);
  saveUserLocalCards(app.userId, [...existing, ...ids]);

  if (Array.isArray(data)) {
    return data.map(String);
  }
  return ids;
}

/** Load owned card ids for the current session. */
export async function fetchOwnedCardIds(): Promise<string[]> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    return loadGuestCardIds();
  }

  const { data, error } = await supabase
    .from("owned_cards")
    .select("card_id")
    .eq("user_id", app.userId);

  if (error) {
    console.warn("owned_cards fetch failed", error.message);
    return loadUserLocalCards(app.userId);
  }

  const ids = (data ?? []).map((row) => String(row.card_id));
  saveUserLocalCards(app.userId, ids);
  return ids;
}

/** Load another player's owned card ids (public leaderboard browse). */
export async function fetchPlayerCardIds(userId: string): Promise<string[]> {
  const id = String(userId ?? "").trim();
  if (!id) return [];

  const { data, error } = await supabase.rpc("get_player_cards", {
    p_user_id: id,
  });

  if (error) {
    console.warn("get_player_cards failed", error.message);
    throw new Error(error.message);
  }

  if (!Array.isArray(data)) return [];
  return [...new Set(data.map(String))];
}
