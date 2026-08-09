import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "./avatar";
import { cached, cacheInvalidate, CacheTtl } from "./cache";
import { pingInbox } from "./trades";

export type MarketplaceListing = {
  id: string;
  sellerId: string;
  sellerUsername: string;
  sellerAvatar: AvatarCrop;
  cardId: string;
  price: number;
  createdAt: string;
  status?: string;
};

export type MarketOffer = {
  id: string;
  listingId: string;
  cardId: string;
  listingPrice: number;
  offerPrice: number;
  partnerId: string;
  partnerUsername: string;
  createdAt: string;
};

export type MarketOfferInbox = {
  incoming: MarketOffer[];
  outgoing: MarketOffer[];
};

export type ListingOfferRow = {
  id: string;
  listingId: string;
  cardId: string;
  listingPrice: number;
  offerPrice: number;
  buyerId: string;
  buyerUsername: string;
  createdAt: string;
  status: string;
};

function requireSession() {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to use the marketplace.");
  }
  return app;
}

async function profilesByIds(ids: string[]) {
  const map = new Map<string, { username: string; avatar: AvatarCrop }>();
  if (!ids.length) return map;
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, username, avatar_card_id, avatar_zoom, avatar_x, avatar_y")
    .in("id", ids);
  for (const p of profileRows ?? []) {
    map.set(String(p.id), {
      username: String(p.username ?? "Player"),
      avatar: normalizeAvatarCrop({
        cardId: p.avatar_card_id ?? null,
        zoom: p.avatar_zoom ?? DEFAULT_AVATAR_CROP.zoom,
        x: p.avatar_x ?? DEFAULT_AVATAR_CROP.x,
        y: p.avatar_y ?? DEFAULT_AVATAR_CROP.y,
      }),
    });
  }
  return map;
}

function mapListing(
  r: {
    id: string;
    seller_id: string;
    card_id: string;
    price: number;
    created_at: string;
    status?: string;
  },
  profiles: Map<string, { username: string; avatar: AvatarCrop }>,
): MarketplaceListing {
  const seller = profiles.get(String(r.seller_id));
  return {
    id: String(r.id),
    sellerId: String(r.seller_id),
    sellerUsername: seller?.username ?? "Player",
    sellerAvatar: seller?.avatar ?? DEFAULT_AVATAR_CROP,
    cardId: String(r.card_id),
    price: Number(r.price) || 0,
    createdAt: String(r.created_at),
    status: r.status ? String(r.status) : undefined,
  };
}

/** Active listings newest-first. */
export async function fetchMarketplaceListings(
  opts?: { force?: boolean },
): Promise<MarketplaceListing[]> {
  return cached(
    "market:listings",
    CacheTtl.listings,
    async () => {
      const { data, error } = await supabase
        .from("marketplace_listings")
        .select("id, seller_id, card_id, price, created_at, status")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw new Error(error.message);

      const rows = data ?? [];
      const profiles = await profilesByIds([
        ...new Set(rows.map((r) => String(r.seller_id))),
      ]);
      return rows.map((r) => mapListing(r, profiles));
    },
    opts,
  );
}

/** One listing (active preferred; sellers can still open cancelled/sold of theirs). */
export async function fetchMarketplaceListing(
  listingId: string,
): Promise<MarketplaceListing | null> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("id, seller_id, card_id, price, created_at, status")
    .eq("id", listingId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const profiles = await profilesByIds([String(data.seller_id)]);
  return mapListing(data, profiles);
}

export async function listCardForSale(
  cardId: string,
  price: number,
): Promise<string> {
  requireSession();
  const amount = Math.round(price);
  if (!Number.isFinite(amount) || amount < 10) {
    throw new Error("Price must be at least 10 Cash.");
  }
  if (amount > 1_000_000) {
    throw new Error("Price can't be over 1,000,000 Cash.");
  }
  const { data, error } = await supabase.rpc("list_card_for_sale", {
    p_card_id: cardId,
    p_price: amount,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("market:");
  return String(data);
}

export async function cancelListing(listingId: string): Promise<void> {
  requireSession();
  const { error } = await supabase.rpc("cancel_listing", {
    p_listing_id: listingId,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("market:");
}

/** Returns buyer's new Cash balance. */
export async function buyListing(listingId: string): Promise<number> {
  requireSession();
  const { data, error } = await supabase.rpc("buy_listing", {
    p_listing_id: listingId,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("market:");
  return typeof data === "number" ? data : Number(data);
}

export async function makeListingOffer(
  listingId: string,
  offerPrice: number,
): Promise<string> {
  requireSession();
  const { data, error } = await supabase.rpc("make_listing_offer", {
    p_listing_id: listingId,
    p_offer_price: Math.round(offerPrice),
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("market:offers");
  return String(data);
}

/** Accept/decline (seller) or cancel (buyer). Returns buyer balance when accepted. */
export async function respondListingOffer(
  offerId: string,
  accept: boolean,
): Promise<number | null> {
  requireSession();
  const { data, error } = await supabase.rpc("respond_listing_offer", {
    p_offer_id: offerId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("market:");
  if (data == null) return null;
  return typeof data === "number" ? data : Number(data);
}

export async function fetchMarketOfferInbox(
  opts?: { force?: boolean },
): Promise<MarketOfferInbox> {
  requireSession();
  return cached(
    "market:offers:inbox",
    CacheTtl.inbox,
    async () => {
      const { data, error } = await supabase.rpc("get_market_offer_inbox");
      if (error) throw new Error(error.message);
      const raw = (data ?? {}) as {
        incoming?: MarketOffer[];
        outgoing?: MarketOffer[];
      };
      return {
        incoming: Array.isArray(raw.incoming) ? raw.incoming : [],
        outgoing: Array.isArray(raw.outgoing) ? raw.outgoing : [],
      };
    },
    opts,
  );
}

export async function fetchListingOffers(
  listingId: string,
): Promise<ListingOfferRow[]> {
  requireSession();
  const { data, error } = await supabase.rpc("get_listing_offers", {
    p_listing_id: listingId,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as ListingOfferRow[]) : [];
}

/** Notify seller/buyer after offer mutations. */
export async function notifyMarketPartner(userId: string): Promise<void> {
  await pingInbox(userId).catch(() => undefined);
}
