import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { towers as baseTowers } from "../data/towers";
import { cardSpecById, matchesCardQuery } from "../lib/cardCatalog";
import {
  fetchMarketplaceListingsPage,
  fetchMyMarketplaceListings,
  listCardForSale,
  MARKET_PAGE_SIZE,
  type MarketplaceListing,
} from "../lib/marketplace";
import { maxPathTier, type MonkeyCardSpec } from "../lib/pathCombos";
import { suggestedParagonValue } from "../lib/paragonProgress";
import { userCollectionPath, listingPath } from "../lib/routes";
import { CashAmount } from "./CurrencyChip";
import { LoadingDots } from "./LoadingDots";
import { MonkeyCard } from "./MonkeyCard";
import { OwnedCardPicker } from "./OwnedCardPicker";
import { PageHeader } from "./PageHeader";
import { UserAvatar } from "./UserAvatar";

type Tab = "browse" | "sell" | "mine";

type SortKey =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "tier-desc"
  | "tier-asc"
  | "tower";

type Props = {
  onBack: () => void;
};

function listingTier(card: MonkeyCardSpec | null): number {
  if (!card) return -1;
  if (card.isParagon) return 6;
  return maxPathTier(card.pathLevels);
}

function formatPostedAt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "price-asc", label: "Price · low to high" },
  { id: "price-desc", label: "Price · high to low" },
  { id: "tier-desc", label: "Tier · high to low" },
  { id: "tier-asc", label: "Tier · low to high" },
  { id: "tower", label: "Tower name" },
];

export function Marketplace({ onBack: _onBack }: Props) {
  const navigate = useNavigate();
  const { user, isGuest, refreshProfile } = useAuth();
  const { owned, paragons, refresh: refreshCards } = useCardCollection();
  const [tab, setTab] = useState<Tab>("browse");
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [myListings, setMyListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [towerFilter, setTowerFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sellStep, setSellStep] = useState<"pick" | "price">("pick");
  const [priceInput, setPriceInput] = useState("100");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const q = query.trim();
    const timer = window.setTimeout(() => setDebouncedQuery(q), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchMarketplaceListingsPage({
          offset: 0,
          force,
          query: debouncedQuery,
          tower: towerFilter,
          sort: sortKey,
        });
        setListings(rows);
        offsetRef.current = rows.length;
        setHasMore(rows.length === MARKET_PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load market.");
        setListings([]);
        offsetRef.current = 0;
        setHasMore(false);
      }
      setLoading(false);
    },
    [debouncedQuery, towerFilter, sortKey],
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchMarketplaceListingsPage({
        offset: offsetRef.current,
        query: debouncedQuery,
        tower: towerFilter,
        sort: sortKey,
      });
      setListings((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        const extra = page.filter((row) => !seen.has(row.id));
        return extra.length ? [...prev, ...extra] : prev;
      });
      offsetRef.current += page.length;
      setHasMore(page.length === MARKET_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more.");
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, debouncedQuery, towerFilter, sortKey]);

  const loadMine = useCallback(async () => {
    if (!user?.id) {
      setMyListings([]);
      return;
    }
    try {
      setMyListings(await fetchMyMarketplaceListings(user.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load your listings.",
      );
      setMyListings([]);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "mine") void loadMine();
  }, [tab, loadMine]);

  useEffect(() => {
    if (tab !== "browse" || loading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      void loadMore();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "640px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tab, loading, hasMore, loadMore, listings.length]);

  const towersForSale = useMemo(
    () => baseTowers.map((t) => t.name).sort((a, b) => a.localeCompare(b)),
    [],
  );

  const browsedListings = useMemo(() => {
    let rows = listings.filter(
      (row) => !owned.has(row.cardId) || row.sellerId === user?.id,
    );

    if (sortKey !== "tier-desc" && sortKey !== "tier-asc" && sortKey !== "tower") {
      return rows;
    }

    return rows.slice().sort((a, b) => {
      const ca = cardSpecById(a.cardId);
      const cb = cardSpecById(b.cardId);
      if (sortKey === "tier-desc") {
        return (
          listingTier(cb) - listingTier(ca) ||
          a.price - b.price ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt)
        );
      }
      if (sortKey === "tier-asc") {
        return (
          listingTier(ca) - listingTier(cb) ||
          a.price - b.price ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt)
        );
      }
      const ta = ca?.tower ?? "";
      const tb = cb?.tower ?? "";
      return (
        ta.localeCompare(tb) ||
        listingTier(cb) - listingTier(ca) ||
        a.price - b.price
      );
    });
  }, [listings, sortKey, owned, user?.id]);

  const sellCardId = [...selected][0] ?? null;
  const sellCard = sellCardId ? cardSpecById(sellCardId) : null;

  const postListings = async (cardIds?: string[]) => {
    if (isGuest || !user) {
      setError("Sign in to sell cards.");
      return;
    }
    const price = Math.round(Number(priceInput));
    if (!Number.isFinite(price) || price < 10) {
      setError("Price must be at least 10 Cash.");
      return;
    }
    if (price > 1_000_000) {
      setError("Price can't be over 1,000,000 Cash.");
      return;
    }
    const toList = cardIds?.length ? cardIds : [...selected];
    if (toList.length === 0) {
      setError("Select a card to sell.");
      return;
    }
    const cardId = toList[0]!;
    setBusyId("sell");
    setError(null);
    setStatus(null);
    try {
      await listCardForSale(cardId, price);
      setSelected(new Set());
      setSellStep("pick");
      setStatus(`Listed for ${price.toLocaleString()} Cash.`);
      await Promise.all([refreshCards(), refreshProfile(), load(true), loadMine()]);
      setTab("mine");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list card.");
      await Promise.all([refreshCards(), load(true)]);
    }
    setBusyId(null);
  };

  const renderListing = (row: MarketplaceListing, mode: "browse" | "mine") => {
    const card = cardSpecById(row.cardId);
    const mine = user?.id === row.sellerId;
    const openListing = () => navigate(listingPath(row.id));
    return (
      <article key={row.id} className="market-card">
        {card ? (
          <MonkeyCard
            entity={card.entity}
            pathLevels={card.pathLevels}
            mode="preview"
            owned
            degree={card.isParagon ? (row.paragonDegree ?? 1) : undefined}
            visualSeed={row.visualSeed}
            onSelect={openListing}
          />
        ) : (
          <button
            type="button"
            className="market-card__missing"
            onClick={openListing}
          >
            {row.cardId}
          </button>
        )}
        <div className="market-card__meta">
          <div className="market-card__price-row">
            <button
              type="button"
              className="market-card__price"
              onClick={openListing}
            >
              <CashAmount amount={row.price} size={16} />
            </button>
            <span className="market-card__time">
              {card?.isParagon
                ? `Deg ${row.paragonDegree ?? 1} · ${formatPostedAt(row.createdAt)}`
                : formatPostedAt(row.createdAt)}
            </span>
          </div>
          {mode === "browse" ? (
            <Link
              className="market-card__seller"
              to={userCollectionPath(row.sellerUsername)}
            >
              <UserAvatar crop={row.sellerAvatar} size={28} />
              <span>{row.sellerUsername}</span>
            </Link>
          ) : (
            <span className="market-card__yours">Your listing</span>
          )}
          <button
            type="button"
            className="btn btn--secondary btn--sm market-card__action"
            onClick={openListing}
          >
            {mode === "mine" || mine ? "Manage" : "View"}
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="market-page">
      <PageHeader
        title="Marketplace"
        blurb="Buy and sell cards from other players."
      />
      <main className="market-main">
        <div className="market-tabs" role="tablist" aria-label="Marketplace">
          {(
            [
              ["browse", "Browse"],
              ["sell", "Sell"],
              ["mine", "My listings"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`market-tabs__btn${tab === id ? " is-active" : ""}`}
              onClick={() => {
                setTab(id);
                setQuery("");
                setError(null);
                setStatus(null);
                if (id === "sell") {
                  setSellStep("pick");
                  setSelected(new Set());
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {isGuest ? (
          <p className="market-banner">Sign in to buy or sell cards.</p>
        ) : null}

        {error ? (
          <p className="market-banner market-banner--err" role="alert">
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="market-banner market-banner--ok" role="status">
            {status}
          </p>
        ) : null}

        {tab !== "sell" ? (
          <div className="market-filters">
            <label className="market-search">
              <span className="market-search__label">
                {tab === "mine"
                  ? "Search your listings"
                  : "Search towers for sale"}
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tower name, upgrade, seller…"
                autoComplete="off"
              />
            </label>

            {tab === "browse" ? (
              <div className="market-toolbar">
                <label className="market-toolbar__field">
                  <span>Tower</span>
                  <select
                    value={towerFilter}
                    onChange={(e) => setTowerFilter(e.target.value)}
                  >
                    <option value="all">All towers</option>
                    {towersForSale.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="market-toolbar__field">
                  <span>Sort</span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm market-refresh"
                  onClick={() => void load(true)}
                  disabled={loading}
                >
                  Refresh
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--ghost btn--sm market-refresh"
                onClick={() => {
                  void load(true);
                  void loadMine();
                }}
                disabled={loading}
              >
                Refresh
              </button>
            )}
          </div>
        ) : null}

        {loading ? (
          <LoadingDots label="Loading marketplace" />
        ) : tab === "browse" ? (
          browsedListings.length === 0 ? (
            <p className="market-empty">
              {listings.length === 0
                ? debouncedQuery
                  ? "No listings match that search."
                  : "No listings yet. Be the first to sell."
                : "No listings match that search."}
            </p>
          ) : (
            <>
              <div className="market-section-head">
                <h3>
                  {sortKey === "newest" ? "Recently posted" : "Listings"}
                </h3>
                <span>
                  {browsedListings.length}
                  {hasMore ? "+" : ""} for sale
                  {towerFilter !== "all" ? ` · ${towerFilter}` : ""}
                </span>
              </div>
              <div className="market-grid">
                {browsedListings.map((row) => renderListing(row, "browse"))}
              </div>
              {hasMore ? (
                <div ref={sentinelRef} className="market-more">
                  {loadingMore ? (
                    <LoadingDots label="Loading more listings" />
                  ) : null}
                </div>
              ) : null}
            </>
          )
        ) : tab === "mine" ? (
          myListings.length === 0 ? (
            <p className="market-empty">
              You have no active listings. Open Sell to post cards.
            </p>
          ) : (
            <div className="market-grid">
              {myListings
                .filter((row) => {
                  const q = query.trim().toLowerCase();
                  if (!q) return true;
                  const card = cardSpecById(row.cardId);
                  return card ? matchesCardQuery(card, q) : true;
                })
                .map((row) => renderListing(row, "mine"))}
            </div>
          )
        ) : (
          <div className="market-sell-pick">
            {sellStep === "pick" ? (
              <OwnedCardPicker
                owned={owned}
                selectedIds={selected}
                multi={false}
                disabled={busyId != null || isGuest}
                confirmLabel="Next"
                onConfirm={(ids) => {
                  const id = ids[0];
                  if (!id) return;
                  setSelected(new Set([id]));
                  setError(null);
                  setStatus(null);
                  const spec = cardSpecById(id);
                  if (spec?.isParagon) {
                    const deg = paragons.get(id)?.degree ?? 1;
                    setPriceInput(String(suggestedParagonValue(deg)));
                  } else {
                    setPriceInput("100");
                  }
                  setSellStep("price");
                  window.scrollTo(0, 0);
                }}
              />
            ) : (
              <div className="market-sell-price">
                {sellCard ? (
                  <div className="market-sell-price__card">
                    <MonkeyCard
                      entity={sellCard.entity}
                      pathLevels={sellCard.pathLevels}
                      mode="preview"
                      owned
                    />
                  </div>
                ) : null}
                <div className="market-sell-price__form">
                  <h3>Set a price</h3>
                  <label className="market-price">
                    <span>Asking price (Cash)</span>
                    <input
                      type="number"
                      min={10}
                      max={1000000}
                      step={10}
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      autoFocus
                    />
                  </label>
                  {sellCard?.isParagon ? (
                    <p className="market-sell-price__hint">
                      Degree {paragons.get(sellCard.id)?.degree ?? 1} · suggested{" "}
                      {suggestedParagonValue(
                        paragons.get(sellCard.id)?.degree ?? 1,
                      ).toLocaleString()}{" "}
                      Cash
                    </p>
                  ) : null}
                </div>
                <div className="market-sell-price__dock">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busyId != null}
                    onClick={() => {
                      setSellStep("pick");
                      setError(null);
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busyId != null || isGuest || !sellCardId}
                    onClick={() =>
                      void postListings(sellCardId ? [sellCardId] : [])
                    }
                  >
                    {busyId === "sell" ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
