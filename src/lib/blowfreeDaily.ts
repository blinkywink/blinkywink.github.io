import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

export type BlowfreeDailyClaim = {
  already: boolean;
  amount: number;
  coins: number | null;
  day: string;
};

/** Pay the Blow Free daily once per UTC day on this account. */
export async function claimBlowfreeDaily(): Promise<BlowfreeDailyClaim | null> {
  if (!getAccessToken() || !loadAppSession()) return null;
  const { data, error } = await supabase.rpc("claim_blowfree_daily");
  if (error) {
    console.warn("claim_blowfree_daily failed", error.message);
    return null;
  }
  const raw = data as {
    already?: boolean;
    amount?: number;
    coins?: number;
    last_blowfree_day?: string;
  } | null;
  return {
    already: Boolean(raw?.already),
    amount: Math.max(0, Number(raw?.amount) || 0),
    coins: raw?.coins == null ? null : Number(raw.coins),
    day: String(raw?.last_blowfree_day ?? "").slice(0, 10),
  };
}
