import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

export type ColorcheckDailyClaim = {
  already: boolean;
  amount: number;
  coins: number | null;
  day: string;
};

/** Pay the Connections daily once per UTC day on this account. */
export async function claimColorcheckDaily(): Promise<ColorcheckDailyClaim | null> {
  if (!getAccessToken() || !loadAppSession()) return null;
  const { data, error } = await supabase.rpc("claim_colorcheck_daily");
  if (error) {
    console.warn("claim_colorcheck_daily failed", error.message);
    return null;
  }
  const raw = data as {
    already?: boolean;
    amount?: number;
    coins?: number;
    last_colorcheck_day?: string;
  } | null;
  return {
    already: Boolean(raw?.already),
    amount: Math.max(0, Number(raw?.amount) || 0),
    coins: raw?.coins == null ? null : Number(raw.coins),
    day: String(raw?.last_colorcheck_day ?? "").slice(0, 10),
  };
}
