import { cacheInvalidate, cached, CacheTtl } from "./cache";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

export const SHOP_DIRECT_T4_PRICE = 7500;
export const SHOP_DIRECT_T5_PRICE = 25000;

export type ShopDirectListing = {
  slot: number;
  cardId: string;
  tier: 4 | 5;
  price: number;
  version: number;
  updatedAt: string;
};

function mapListing(raw: Record<string, unknown>): ShopDirectListing | null {
  const slot = Number(raw.slot);
  const tier = Number(raw.tier);
  const cardId = String(raw.cardId ?? raw.card_id ?? "").trim();
  const price = Number(raw.price);
  const version = Number(raw.version);
  if (!cardId || (tier !== 4 && tier !== 5)) return null;
  if (!Number.isFinite(slot) || slot < 1 || slot > 4) return null;
  return {
    slot,
    cardId,
    tier: tier as 4 | 5,
    price: Number.isFinite(price)
      ? price
      : tier === 5
        ? SHOP_DIRECT_T5_PRICE
        : SHOP_DIRECT_T4_PRICE,
    version: Number.isFinite(version) ? version : 0,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
  };
}

export async function fetchShopDirectListings(
  opts?: { force?: boolean },
): Promise<ShopDirectListing[]> {
  const key = "shop:direct";
  if (opts?.force) cacheInvalidate(key);
  return cached(key, CacheTtl.listings, async () => {
    const { data, error } = await supabase.rpc("get_shop_direct_listings");
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((r) => mapListing((r ?? {}) as Record<string, unknown>))
      .filter((x): x is ShopDirectListing => Boolean(x))
      .sort((a, b) => a.slot - b.slot);
  });
}

export type BuyShopDirectResult = {
  boughtCardId: string;
  boughtTier: 4 | 5;
  price: number;
  coins: number;
  listings: ShopDirectListing[];
};

export async function buyShopDirectCard(
  slot: number,
  version: number,
): Promise<BuyShopDirectResult> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to buy shop cards.");
  }
  const { data, error } = await supabase.rpc("buy_shop_direct_card", {
    p_slot: slot,
    p_version: version,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("SOLD_OUT")) {
      throw new Error("Someone else just bought that card.");
    }
    if (msg.includes("ALREADY_OWNED")) {
      throw new Error("You already own that card.");
    }
    if (msg.includes("Insufficient")) {
      throw new Error("Not enough Cash.");
    }
    throw new Error(msg || "Could not buy card.");
  }
  cacheInvalidate("shop:direct");
  const raw = (data ?? {}) as Record<string, unknown>;
  const listingsRaw = Array.isArray(raw.listings) ? raw.listings : [];
  return {
    boughtCardId: String(raw.boughtCardId ?? ""),
    boughtTier: Number(raw.boughtTier) === 5 ? 5 : 4,
    price: Number(raw.price) || 0,
    coins: Number(raw.coins) || 0,
    listings: listingsRaw
      .map((r) => mapListing((r ?? {}) as Record<string, unknown>))
      .filter((x): x is ShopDirectListing => Boolean(x))
      .sort((a, b) => a.slot - b.slot),
  };
}
