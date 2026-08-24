import { getAccessToken, supabase } from "./supabase";
import { spendGuestCoins } from "./guestWallet";
import { loadAppSession } from "../auth/session";

export type SpendCoinsOpts = {
  /** Counts toward the marketplace unlock (packs / shop). */
  shop?: boolean;
};

/** Spend Cash - cloud if signed in, guest cookie wallet otherwise. */
export async function spendCoins(
  amount: number,
  opts?: SpendCoinsOpts,
): Promise<number | null> {
  if (!Number.isFinite(amount) || amount < 1) return null;
  const rounded = Math.round(amount);

  if (!getAccessToken() || !loadAppSession()) {
    return spendGuestCoins(rounded);
  }

  const { data, error } = await supabase.rpc("spend_coins", {
    p_amount: rounded,
    p_shop: Boolean(opts?.shop),
  });

  if (error) {
    console.warn("spend_coins failed", error.message);
    return null;
  }

  return typeof data === "number" ? data : Number(data);
}
