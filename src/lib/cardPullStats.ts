import { cacheInvalidate, cached, CacheTtl } from "./cache";
import { supabase } from "./supabase";

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

  for (const id of new Set(ids)) {
    cacheInvalidate(`card-pulls:${id}`);
  }
}

/** Global times this card has been pulled across the game. */
export async function fetchCardPullCount(cardId: string): Promise<number> {
  const id = String(cardId ?? "").trim();
  if (id.length < 3) return 0;

  return cached(`card-pulls:${id}`, CacheTtl.cardPullCount, async () => {
    const { data, error } = await supabase.rpc("get_card_pull_count", {
      p_card_id: id,
    });
    if (error) {
      console.warn("get_card_pull_count failed", error.message);
      return 0;
    }
    const n = Number(data);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  });
}
