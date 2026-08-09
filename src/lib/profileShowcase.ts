import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "./cache";

export const SHOWCASE_MAX = 3;

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

export async function setProfileShowcase(cardIds: string[]): Promise<void> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to set showcase cards.");
  }
  const cleaned = normalizeShowcaseIds(cardIds);
  const { error } = await supabase.rpc("set_profile_showcase", {
    p_card_ids: cleaned,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("profile:");
}

export function showcaseFromProfile(row: {
  showcase_card_ids?: string[] | null;
}): string[] {
  return normalizeShowcaseIds(row.showcase_card_ids);
}
