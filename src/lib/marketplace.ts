import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

export type MarketplaceListing = {
  id: string;
  sellerId: string;
  sellerUsername: string;
  cardId: string;
  price: number;
  createdAt: string;
};

function requireSession() {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to use the marketplace.");
  }
  return app;
}

/** Active listings newest-first. */
export async function fetchMarketplaceListings(): Promise<MarketplaceListing[]> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("id, seller_id, card_id, price, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const sellerIds = [...new Set(rows.map((r) => String(r.seller_id)))];
  const names = new Map<string, string>();
  if (sellerIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", sellerIds);
    for (const p of profiles ?? []) {
      names.set(String(p.id), String(p.username ?? "Player"));
    }
  }

  return rows.map((r) => ({
    id: String(r.id),
    sellerId: String(r.seller_id),
    sellerUsername: names.get(String(r.seller_id)) ?? "Player",
    cardId: String(r.card_id),
    price: Number(r.price) || 0,
    createdAt: String(r.created_at),
  }));
}

export async function listCardForSale(
  cardId: string,
  price: number,
): Promise<string> {
  requireSession();
  const { data, error } = await supabase.rpc("list_card_for_sale", {
    p_card_id: cardId,
    p_price: Math.round(price),
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function cancelListing(listingId: string): Promise<void> {
  requireSession();
  const { error } = await supabase.rpc("cancel_listing", {
    p_listing_id: listingId,
  });
  if (error) throw new Error(error.message);
}

/** Returns buyer's new Cash balance. */
export async function buyListing(listingId: string): Promise<number> {
  requireSession();
  const { data, error } = await supabase.rpc("buy_listing", {
    p_listing_id: listingId,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : Number(data);
}
