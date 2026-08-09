import { getAccessToken, supabase } from "./supabase";
import { spendGuestCoins } from "./guestWallet";
import { loadAppSession } from "../auth/session";

/** Spend Cash — cloud if signed in, guest cookie wallet otherwise. */
export async function spendCoins(amount: number): Promise<number | null> {
  if (!Number.isFinite(amount) || amount < 1) return null;
  const rounded = Math.round(amount);

  if (!getAccessToken() || !loadAppSession()) {
    return spendGuestCoins(rounded);
  }

  const { data, error } = await supabase.rpc("spend_coins", {
    p_amount: rounded,
  });

  if (error) {
    console.warn("spend_coins failed", error.message);
    return null;
  }

  return typeof data === "number" ? data : Number(data);
}
