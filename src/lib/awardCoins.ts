import { getAccessToken, supabase } from "./supabase";
import { awardGuestCoins } from "./guestWallet";
import { loadAppSession } from "../auth/session";

/** Credit Cash — cloud if signed in, guest cookie wallet otherwise. */
export async function awardCoins(amount: number): Promise<number | null> {
  if (!Number.isFinite(amount) || amount < 1) return null;
  const rounded = Math.round(amount);

  if (!getAccessToken() || !loadAppSession()) {
    return awardGuestCoins(rounded);
  }

  const { data, error } = await supabase.rpc("award_coins", {
    p_amount: rounded,
  });

  if (error) {
    console.warn("award_coins failed", error.message);
    return null;
  }

  return typeof data === "number" ? data : Number(data);
}
