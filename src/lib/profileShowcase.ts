import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "./cache";

export const SHOWCASE_MAX = 3;
export const SHOWCASE_SLOT_COST = 5_000;
export const SHOWCASE_CHANGE_COST = 500;

/** Normalize / cap to at most 3 unique non-empty card ids. */
export function normalizeShowcaseIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= SHOWCASE_MAX) break;
  }
  return out;
}

export function showcaseSlotsFromProfile(row: {
  showcase_slots?: number | null;
  showcase_card_ids?: string[] | null;
}): number {
  const filled = normalizeShowcaseIds(row.showcase_card_ids).length;
  const slots = Number(row.showcase_slots);
  if (!Number.isFinite(slots)) return Math.min(SHOWCASE_MAX, filled);
  return Math.max(0, Math.min(SHOWCASE_MAX, Math.floor(slots)));
}

/** Returns new Cash balance. */
export async function buyShowcaseSlot(): Promise<number> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to buy a showcase slot.");
  }
  const { data, error } = await supabase.rpc("buy_showcase_slot");
  if (error) {
    if (/Insufficient coins/i.test(error.message)) {
      throw new Error(
        `Need ${SHOWCASE_SLOT_COST.toLocaleString()} Cash for a showcase slot.`,
      );
    }
    if (/All showcase slots/i.test(error.message)) {
      throw new Error("You already own all 3 showcase slots.");
    }
    throw new Error(error.message);
  }
  cacheInvalidate("profile:");
  return typeof data === "number" ? data : Number(data);
}

/** Returns new Cash balance. Removals free; new cards cost CHANGE fee. */
export async function setProfileShowcase(cardIds: string[]): Promise<number> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to set showcase cards.");
  }
  const cleaned = normalizeShowcaseIds(cardIds);
  const { data, error } = await supabase.rpc("set_profile_showcase", {
    p_card_ids: cleaned,
  });
  if (error) {
    if (/Need more showcase slots/i.test(error.message)) {
      throw new Error("Buy another showcase slot first.");
    }
    if (/Insufficient coins/i.test(error.message)) {
      throw new Error(
        `Need ${SHOWCASE_CHANGE_COST.toLocaleString()} Cash to set a showcase card.`,
      );
    }
    throw new Error(error.message);
  }
  cacheInvalidate("profile:");
  return typeof data === "number" ? data : Number(data);
}

export function showcaseFromProfile(row: {
  showcase_card_ids?: string[] | null;
}): string[] {
  return normalizeShowcaseIds(row.showcase_card_ids);
}

/** Keep only cards the player still owns. Removals are free. */
export async function pruneUnownedShowcase(
  ownedIds: Iterable<string>,
  currentIds: string[],
): Promise<string[] | null> {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds);
  const current = normalizeShowcaseIds(currentIds);
  const kept = current.filter((id) => owned.has(id));
  if (kept.length === current.length) return null;
  await setProfileShowcase(kept);
  return kept;
}
