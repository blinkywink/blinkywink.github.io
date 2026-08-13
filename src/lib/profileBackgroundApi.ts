import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "./cache";
import { normalizeBackgroundId } from "./profileBackgrounds";

export async function setProfileBackground(bgId: string): Promise<number> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to set a profile background.");
  }
  const normalized = normalizeBackgroundId(bgId);
  if (!normalized) throw new Error("Pick a valid background.");

  const { data, error } = await supabase.rpc("set_profile_background", {
    p_bg_id: normalized,
  });
  if (error) {
    if (/Insufficient coins/i.test(error.message)) {
      throw new Error("Not enough Cash for that background.");
    }
    throw new Error(error.message);
  }
  cacheInvalidate("profile:");
  return typeof data === "number" ? data : Number(data);
}
