import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

export type BloonleDailyClaim = {
  already: boolean;
  amount: number;
  coins: number | null;
  day: string;
};

/** Pay the Bloonle daily once per UTC day on this account. */
export async function claimBloonleDaily(
  guessCount: number,
): Promise<BloonleDailyClaim | null> {
  if (!getAccessToken() || !loadAppSession()) return null;
  const { data, error } = await supabase.rpc("claim_bloonle_daily", {
    p_guess_count: Math.max(1, Math.min(6, Math.floor(guessCount))),
  });
  if (error) {
    console.warn("claim_bloonle_daily failed", error.message);
    return null;
  }
  const raw = data as {
    already?: boolean;
    amount?: number;
    coins?: number;
    last_bloonle_day?: string;
  } | null;
  return {
    already: Boolean(raw?.already),
    amount: Math.max(0, Number(raw?.amount) || 0),
    coins: raw?.coins == null ? null : Number(raw.coins),
    day: String(raw?.last_bloonle_day ?? "").slice(0, 10),
  };
}
