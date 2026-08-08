import { awardCards } from "./awardCards";
import { awardCoins } from "./awardCoins";
import {
  clearGuestCards,
  loadGuestCardIds,
} from "./guestCollection";
import { loadGuestWallet, saveGuestWallet } from "./guestWallet";
import { getAccessToken } from "./supabase";
import { loadAppSession } from "../auth/session";

const CARD_CHUNK = 40;
const COIN_CHUNK = 10000;

let inflight: Promise<void> | null = null;

function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function mergeOnce(): Promise<void> {
  if (!getAccessToken() || !loadAppSession()) return;

  const guestCards = loadGuestCardIds();
  const guestWallet = loadGuestWallet();
  if (
    guestCards.length === 0 &&
    guestWallet.coins <= 0 &&
    guestWallet.monkey_money <= 0
  ) {
    return;
  }

  if (guestCards.length > 0) {
    for (const group of chunkIds(guestCards, CARD_CHUNK)) {
      await awardCards(group);
    }
    clearGuestCards();
  }

  if (guestWallet.coins > 0) {
    let remaining = guestWallet.coins;
    let ok = true;
    while (remaining > 0) {
      const amount = Math.min(remaining, COIN_CHUNK);
      const balance = await awardCoins(amount);
      if (balance == null) {
        ok = false;
        break;
      }
      remaining -= amount;
    }
    if (ok) {
      saveGuestWallet({
        coins: 0,
        monkey_money: guestWallet.monkey_money,
      });
    }
  }

  const leftover = loadGuestWallet();
  if (leftover.coins <= 0) {
    saveGuestWallet({ coins: 0, monkey_money: 0 });
  }
}

/**
 * Copy guest wallet + card collection onto the signed-in account, then clear
 * local guest data so it isn't applied twice.
 */
export function mergeGuestProgressIntoAccount(): Promise<void> {
  if (!inflight) {
    inflight = mergeOnce().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
