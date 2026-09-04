import { cacheInvalidate, cached, CacheTtl } from "./cache";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession, userFacingRpcError } from "../auth/session";
import { formatShopCountdown } from "./packTheme";

/** Typical T4 deal ceiling (old list was 7500). */
export const SHOP_DIRECT_T4_PRICE = 5200;
/** Typical T5 deal ceiling (old list was 25000). */
export const SHOP_DIRECT_T5_PRICE = 16700;
/** Sold limited slots restock after this long. */
export const SHOP_DIRECT_RESTOCK_MS = 4 * 60 * 60 * 1000;

export type ShopDirectListing = {
  slot: number;
  cardId: string;
  tier: 4 | 5;
  price: number;
  version: number;
  updatedAt: string;
  availableAt: string;
};

export function shopDirectIsSold(listing: ShopDirectListing): boolean {
  if (!listing.cardId) return true;
  if (listing.price <= 0) return true;
  const restock = Date.parse(listing.availableAt);
  return Number.isFinite(restock) && restock > Date.now();
}

/** UTC ms when a sold slot restocks. */
export function shopDirectRestockAtMs(listing: ShopDirectListing): number {
  const start = Date.parse(listing.availableAt);
  if (Number.isFinite(start)) return start;
  const bought = Date.parse(listing.updatedAt);
  if (!Number.isFinite(bought)) return Date.now() + SHOP_DIRECT_RESTOCK_MS;
  return bought + SHOP_DIRECT_RESTOCK_MS;
}

export function formatShopDirectCountdown(
  listing: ShopDirectListing,
  now = Date.now(),
): string {
  return formatShopCountdown(Math.max(0, shopDirectRestockAtMs(listing) - now));
}

function mapListing(raw: Record<string, unknown>): ShopDirectListing | null {
  const slot = Number(raw.slot);
  const tierRaw = Number(raw.tier);
  const cardId = String(raw.cardId ?? raw.card_id ?? "").trim();
  const price = Number(raw.price);
  const version = Number(raw.version);
  const tier: 4 | 5 = tierRaw === 5 ? 5 : 4;
  if (!Number.isFinite(slot) || slot < 1 || slot > 4) return null;
  return {
    slot,
    cardId,
    tier,
    price: Number.isFinite(price) ? price : 0,
    version: Number.isFinite(version) ? version : 0,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
    availableAt: String(raw.availableAt ?? raw.available_at ?? ""),
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
    const msg = userFacingRpcError(error, "Sign in to buy shop cards.");
    if (msg.includes("SOLD_OUT") || /SOLD_OUT/i.test(error.message ?? "")) {
      throw new Error("Someone else just bought that card.");
    }
    if (msg.includes("ALREADY_OWNED") || /ALREADY_OWNED/i.test(error.message ?? "")) {
      throw new Error("You already own that card.");
    }
    if (/Insufficient/i.test(msg) || /Insufficient/i.test(error.message ?? "")) {
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
