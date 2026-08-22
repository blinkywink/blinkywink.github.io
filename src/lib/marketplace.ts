import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "./avatar";
import { allCardSpecs, matchesCardQuery } from "./cardCatalog";
import { cached, cacheGetStale, cacheInvalidate, CacheTtl } from "./cache";
import { pingInbox } from "./trades";

export const MARKET_PAGE_SIZE = 24;
export const MAX_MARKET_PRICE = 100_000_000;

export type MarketplaceListing = {
  id: string;
  sellerId: string;
  sellerUsername: string;
  sellerAvatar: AvatarCrop;
  cardId: string;
  price: number;
  createdAt: string;
  status?: string;
  paragonDegree?: number | null;
  paragonXp?: number | null;
  visualSeed?: number | null;
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

type ListingRow = {
  id: string;
  seller_id: string;
  card_id: string;
  price: number;
  created_at: string;
  status?: string;
  paragon_degree?: number | null;
  paragon_xp?: number | null;
  visual_seed?: number | null;
};

function mapListing(
  r: ListingRow,
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
    paragonDegree:
      r.paragon_degree == null ? null : Number(r.paragon_degree) || 1,
    paragonXp: r.paragon_xp == null ? null : Number(r.paragon_xp) || 0,
    visualSeed:
      r.visual_seed == null || !Number.isFinite(Number(r.visual_seed))
        ? null
        : Math.floor(Number(r.visual_seed)),
  };
}

const LISTING_COLS =
  "id, seller_id, card_id, price, created_at, status, paragon_degree, paragon_xp, visual_seed";
const LISTING_COLS_FALLBACK = "id, seller_id, card_id, price, created_at, status";

export type MarketSortKey =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "tier-desc"
  | "tier-asc"
  | "tower";

export type MarketListQuery = {
  offset?: number;
  limit?: number;
  force?: boolean;
  revalidate?: boolean;
  onRevalidate?: (rows: MarketplaceListing[]) => void;
  query?: string;
  tower?: string;
  sort?: MarketSortKey;
};

function escapeIlike(raw: string): string {
  return raw.replace(/[%_]/g, "");
}

async function fetchListingRows(
  cols: string,
  opts: {
    offset: number;
    limit: number;
    query: string;
    tower: string;
    sort: MarketSortKey;
    sellerId?: string;
  },
) {
  let req = supabase
    .from("marketplace_listings")
    .select(cols)
    .eq("status", "active");

  if (opts.sellerId) {
    req = req.eq("seller_id", opts.sellerId);
  }

  if (opts.tower && opts.tower !== "all") {
    const ids = allCardSpecs()
      .filter((card) => card.tower === opts.tower)
      .map((card) => card.id);
    if (!ids.length) return { data: [] as ListingRow[], error: null };
    req = req.in("card_id", ids);
  }

  const q = opts.query.trim();
  if (q.length >= 2) {
    const needle = q.toLowerCase();
    const cardIds = allCardSpecs()
      .filter((card) => matchesCardQuery(card, needle))
      .map((card) => card.id);
    const { data: sellers } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", `%${escapeIlike(q)}%`)
      .limit(40);
    const sellerIds = (sellers ?? []).map((row) => String(row.id));
    const ors = [`card_id.ilike.%${escapeIlike(q)}%`];
    if (sellerIds.length) {
      ors.push(`seller_id.in.(${sellerIds.join(",")})`);
    }
    if (cardIds.length > 0 && cardIds.length <= 80) {
      ors.push(`card_id.in.(${cardIds.join(",")})`);
    }
    req = req.or(ors.join(","));
  }

  if (opts.sort === "price-asc") {
    req = req
      .order("price", { ascending: true })
      .order("created_at", { ascending: false });
  } else if (opts.sort === "price-desc") {
    req = req
      .order("price", { ascending: false })
      .order("created_at", { ascending: false });
  } else {
    req = req.order("created_at", { ascending: false });
  }

  return req.range(opts.offset, opts.offset + opts.limit - 1);
}

async function hydrateListings(rows: ListingRow[]): Promise<MarketplaceListing[]> {
  const profiles = await profilesByIds([
    ...new Set(rows.map((r) => String(r.seller_id))),
  ]);
  return rows.map((r) => mapListing(r, profiles));
}

function marketListingsCacheKey(opts?: MarketListQuery): string {
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
  const limit = Math.min(100, Math.max(1, opts?.limit ?? MARKET_PAGE_SIZE));
  const query = String(opts?.query ?? "").trim();
  const tower = String(opts?.tower ?? "all");
  const sort = opts?.sort ?? "newest";
  return `market:listings:${offset}:${limit}:${tower}:${sort}:${query.toLowerCase()}`;
}

export function peekMarketplaceListingsPage(
  opts?: MarketListQuery,
): MarketplaceListing[] | undefined {
  return cacheGetStale<MarketplaceListing[]>(marketListingsCacheKey(opts));
}

/** One page of active listings. Search/filter hit the server, not just loaded rows. */
export async function fetchMarketplaceListingsPage(
  opts?: MarketListQuery,
): Promise<MarketplaceListing[]> {
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
  const limit = Math.min(100, Math.max(1, opts?.limit ?? MARKET_PAGE_SIZE));
  const query = String(opts?.query ?? "").trim();
  const tower = String(opts?.tower ?? "all");
  const sort = opts?.sort ?? "newest";
  const key = marketListingsCacheKey({
    offset,
    limit,
    query,
    tower,
    sort,
  });

  return cached(
    key,
    CacheTtl.listings,
    async () => {
      const first = await fetchListingRows(LISTING_COLS, {
        offset,
        limit,
        query,
        tower,
        sort,
      });
      const result = first.error
        ? await fetchListingRows(LISTING_COLS_FALLBACK, {
            offset,
            limit,
            query,
            tower,
            sort,
          })
        : first;
      if (result.error) throw new Error(result.error.message);
      return hydrateListings((result.data ?? []) as ListingRow[]);
    },
    { force: opts?.force, revalidate: opts?.revalidate, onRevalidate: opts?.onRevalidate },
  );
}

/** Active listings newest-first (first page). */
export async function fetchMarketplaceListings(
  opts?: { force?: boolean },
): Promise<MarketplaceListing[]> {
  return fetchMarketplaceListingsPage({
    offset: 0,
    limit: MARKET_PAGE_SIZE,
    force: opts?.force,
  });
}

export type ActiveListedCard = {
  cardId: string;
  paragonDegree: number | null;
  paragonXp: number | null;
};

/** Active marketplace listings for dup detection / paragon snapshots while escrowed. */
export async function fetchMyActiveListedCards(
  sellerId: string,
): Promise<ActiveListedCard[]> {
  const id = String(sellerId ?? "").trim();
  if (!id || !getAccessToken()) return [];
  return cached(`market:listings:mine:active:${id}`, CacheTtl.listings, async () => {
    const first = await supabase
      .from("marketplace_listings")
      .select("card_id, paragon_degree, paragon_xp")
      .eq("seller_id", id)
      .eq("status", "active");
    const result = first.error
      ? await supabase
          .from("marketplace_listings")
          .select("card_id")
          .eq("seller_id", id)
          .eq("status", "active")
      : first;
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []).map((row) => {
      const r = row as ListingRow;
      return {
        cardId: String(r.card_id),
        paragonDegree:
          r.paragon_degree == null ? null : Number(r.paragon_degree) || 1,
        paragonXp: r.paragon_xp == null ? null : Number(r.paragon_xp) || 0,
      };
    });
  });
}

/** The signed-in player's active listings. */
export async function fetchMyMarketplaceListings(
  sellerId: string,
): Promise<MarketplaceListing[]> {
  const id = String(sellerId ?? "").trim();
  if (!id) return [];
  return cached(`market:listings:mine:${id}`, CacheTtl.listings, async () => {
    const first = await fetchListingRows(LISTING_COLS, {
      offset: 0,
      limit: 100,
      query: "",
      tower: "all",
      sort: "newest",
      sellerId: id,
    });
    const result = first.error
      ? await fetchListingRows(LISTING_COLS_FALLBACK, {
          offset: 0,
          limit: 100,
          query: "",
          tower: "all",
          sort: "newest",
          sellerId: id,
        })
      : first;
    if (result.error) throw new Error(result.error.message);
    return hydrateListings((result.data ?? []) as ListingRow[]);
  });
}

/** One listing (active preferred; sellers can still open cancelled/sold of theirs). */
export async function fetchMarketplaceListing(
  listingId: string,
): Promise<MarketplaceListing | null> {
  const first = await supabase
    .from("marketplace_listings")
    .select(LISTING_COLS)
    .eq("id", listingId)
    .maybeSingle();

  const result = first.error
    ? await supabase
        .from("marketplace_listings")
        .select(LISTING_COLS_FALLBACK)
        .eq("id", listingId)
        .maybeSingle()
    : first;

  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;

  const profiles = await profilesByIds([String(result.data.seller_id)]);
  return mapListing(result.data as ListingRow, profiles);
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
  if (amount > MAX_MARKET_PRICE) {
    throw new Error(`Price can't be over ${MAX_MARKET_PRICE.toLocaleString()} Cash.`);
  }
  const { data, error } = await supabase.rpc("list_card_for_sale", {
    p_card_id: cardId,
    p_price: amount,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("market:");
  cacheInvalidate("profile:");
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

export type MarketSaleNotice = {
  id: string;
  listingId: string;
  cardId: string;
  price: number;
  buyerId: string;
  buyerUsername: string;
  createdAt: string;
};

export async function fetchMarketSaleNotices(
  opts?: { force?: boolean },
): Promise<MarketSaleNotice[]> {
  requireSession();
  return cached(
    "market:sales:inbox",
    CacheTtl.inbox,
    async () => {
      const { data, error } = await supabase.rpc("get_market_sale_notices");
      if (error) throw new Error(error.message);
      const raw = (data ?? {}) as { sales?: MarketSaleNotice[] };
      return Array.isArray(raw.sales) ? raw.sales : [];
    },
    opts,
  );
}

export async function ackMarketSaleNotices(ids: string[]): Promise<void> {
  requireSession();
  if (!ids.length) return;
  const { error } = await supabase.rpc("ack_market_sale_notices", {
    p_ids: ids,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("market:sales");
}

/** Notify seller/buyer after offer mutations. */
export async function notifyMarketPartner(userId: string): Promise<void> {
  await pingInbox(userId).catch(() => undefined);
}
