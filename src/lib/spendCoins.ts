import { getAccessToken, supabase } from "./supabase";
import { spendGuestCoins } from "./guestWallet";
import { loadAppSession } from "../auth/session";

export type SpendCoinsOpts = {
  /** Counts toward the marketplace unlock (packs / shop). */
  shop?: boolean;
};

let lastSpendError: string | null = null;

/** Message from the last failed cloud spend, if any. */
export function takeLastSpendError(): string | null {
  const msg = lastSpendError;
  lastSpendError = null;
  return msg;
}

function spendErrorMessage(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}): string {
  const raw = [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(" ");
  if (/Not authenticated/i.test(raw)) return "Sign in to buy.";
  if (/Insufficient coins/i.test(raw)) return "Not enough Cash.";
  if (/Invalid coin amount/i.test(raw)) return "That purchase amount is not allowed.";
  if (/PGRST203|Could not choose/i.test(raw)) {
    return "Shop is updating. Try again in a moment.";
  }
  if (/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(raw)) {
    return "Could not reach the shop. Check your connection.";
  }
  return "Purchase failed, try again.";
}

/** Spend Cash - cloud if signed in, guest cookie wallet otherwise. */
export async function spendCoins(
  amount: number,
  opts?: SpendCoinsOpts,
): Promise<number | null> {
  lastSpendError = null;
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
    lastSpendError = spendErrorMessage(error);
    console.warn("spend_coins failed", error.message, error.code);
    return null;
  }

  const next = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(next)) {
    lastSpendError = "Purchase failed, try again.";
    return null;
  }
  return next;
}
