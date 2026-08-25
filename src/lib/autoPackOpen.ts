import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "./cache";

/** One-time unlock for hands-free pack opening. */
export const AUTO_PACK_OPEN_COST = 20_000;

export function autoPackUnlockedFromProfile(row: {
  auto_pack_unlocked?: boolean | null;
} | null | undefined): boolean {
  return Boolean(row?.auto_pack_unlocked);
}

/** Buy Auto Pack Open. Returns new Cash balance. */
export async function buyAutoPackOpen(): Promise<number> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to unlock Auto Open.");
  }
  const { data, error } = await supabase.rpc("buy_auto_pack_open");
  if (error) throw new Error(error.message);
  cacheInvalidate(`profile:${app.userId}`);
  return typeof data === "number" ? data : Number(data);
}
