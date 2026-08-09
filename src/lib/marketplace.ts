import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "./avatar";

export type MarketplaceListing = {
  id: string;
  sellerId: string;
  sellerUsername: string;
  sellerAvatar: AvatarCrop;
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
  const profiles = new Map<
    string,
    { username: string; avatar: AvatarCrop }
  >();
  if (sellerIds.length) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select(
        "id, username, avatar_card_id, avatar_zoom, avatar_x, avatar_y",
      )
      .in("id", sellerIds);
    for (const p of profileRows ?? []) {
      profiles.set(String(p.id), {
        username: String(p.username ?? "Player"),
        avatar: normalizeAvatarCrop({
          cardId: p.avatar_card_id ?? null,
          zoom: p.avatar_zoom ?? DEFAULT_AVATAR_CROP.zoom,
          x: p.avatar_x ?? DEFAULT_AVATAR_CROP.x,
          y: p.avatar_y ?? DEFAULT_AVATAR_CROP.y,
        }),
      });
    }
  }

  return rows.map((r) => {
    const seller = profiles.get(String(r.seller_id));
    return {
      id: String(r.id),
      sellerId: String(r.seller_id),
      sellerUsername: seller?.username ?? "Player",
      sellerAvatar: seller?.avatar ?? DEFAULT_AVATAR_CROP,
      cardId: String(r.card_id),
      price: Number(r.price) || 0,
      createdAt: String(r.created_at),
    };
  });
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
