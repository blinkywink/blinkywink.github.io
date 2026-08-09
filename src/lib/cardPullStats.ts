import { cacheInvalidate, cached, CacheTtl } from "./cache";
import { supabase } from "./supabase";

export type CardPullStats = {
  /** Times this specific card was pulled (includes duplicates). */
  count: number;
  /** All card pulls in the game ever (includes every duplicate). */
  total: number;
};

/** Bump global pull totals when a pack is opened (includes duplicates). */
export async function recordCardPulls(cardIds: string[]): Promise<void> {
  const ids = cardIds
    .map((id) => String(id ?? "").trim())
    .filter((id) => id.length >= 3 && id.length <= 80);
  if (!ids.length) return;

  const { error } = await supabase.rpc("record_card_pulls", {
    p_card_ids: ids,
  });
  if (error) {
    console.warn("record_card_pulls failed", error.message);
    return;
  }

  cacheInvalidate("card-pulls:");
}

/** Per-card pulls + all-time total pulls (duplicates count in both). */
export async function fetchCardPullStats(
  cardId: string,
): Promise<CardPullStats> {
  const id = String(cardId ?? "").trim();
  if (id.length < 3) return { count: 0, total: 0 };

  return cached(`card-pulls:${id}`, CacheTtl.cardPullCount, async () => {
    const { data, error } = await supabase.rpc("get_card_pull_stats", {
      p_card_id: id,
    });
    if (error) {
      console.warn("get_card_pull_stats failed", error.message);
      return { count: 0, total: 0 };
    }
    const raw = data as { count?: unknown; total?: unknown } | null;
    const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
    const total = Math.max(0, Math.floor(Number(raw?.total) || 0));
    return { count, total: Math.max(total, count) };
  });
}
