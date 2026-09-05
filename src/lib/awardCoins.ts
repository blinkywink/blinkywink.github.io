import { getAccessToken, supabase } from "./supabase";
import { awardGuestCoins } from "./guestWallet";
import {
  emitSessionInvalid,
  isNotAuthenticatedError,
  loadAppSession,
  rpcErrorText,
} from "../auth/session";
import type { GamePath } from "./routes";
import { awardGameCoins } from "./gameFarm";

/** Credit Cash - cloud if signed in, guest cookie wallet otherwise. */
export async function awardCoins(
  amount: number,
  gameId?: GamePath | null,
): Promise<number | null> {
  if (!Number.isFinite(amount) || amount < 1) return null;
  const rounded = Math.round(amount);

  const plainAward = async (): Promise<number | null> => {
    if (!getAccessToken() || !loadAppSession()) {
      return awardGuestCoins(rounded);
    }
    const { data, error } = await supabase.rpc("award_coins", {
      p_amount: rounded,
    });
    if (error) {
      console.warn("award_coins failed", error.message);
      if (isNotAuthenticatedError(rpcErrorText(error))) emitSessionInvalid();
      return null;
    }
    return typeof data === "number" ? data : Number(data);
  };

  if (gameId) {
    const snap = await awardGameCoins(rounded, gameId);
    if (snap.coins != null) return snap.coins;
    // Farm RPC missing/broken → still pay via the plain path (mute still enforced client-side).
    if (snap.canPay === false) return null;
    return plainAward();
  }

  return plainAward();
}
