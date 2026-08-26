import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { towers as baseTowers } from "../data/towers";
import { cardSpecById, matchesCardQuery, allCardSpecs } from "../lib/cardCatalog";
import {
  fetchMarketplaceListingsPage,
  fetchMyMarketplaceListings,
  listCardForSale,
  peekMarketplaceListingsPage,
  MARKET_PAGE_SIZE,
  MAX_MARKET_PRICE,
  type MarketplaceListing,
} from "../lib/marketplace";
import { maxPathTier, sortCardSpecs, type MonkeyCardSpec } from "../lib/pathCombos";
import { suggestedListingRange, formatListingRange } from "../lib/listingValue";
import {
  MARKET_SHOP_SPEND_REQUIRED,
  shopSpendRemaining,
  shopSpendUnlocked,
} from "../lib/marketShopGate";
import { userCollectionPath, listingPath } from "../lib/routes";
import { CashAmount } from "./CurrencyChip";
import { LoadingDots } from "./LoadingDots";
import { MarketToShopLink } from "./ShopMarketSwap";
import { MonkeyCard } from "./MonkeyCard";
import { UserAvatar } from "./UserAvatar";
import { VisibleCardGrid } from "./VisibleCardGrid";

type Tab = "browse" | "sell";

type SellErrorBoundaryState = { error: string | null };

class SellErrorBoundary extends Component<
  { children: ReactNode },
  SellErrorBoundaryState
> {
  state: SellErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): SellErrorBoundaryState {
    return {
      error: error instanceof Error ? error.message : "Could not open Sell.",
    };
  }

  render() {
    if (this.state.error) {
      return <p className="market-banner market-banner--err">{this.state.error}</p>;
    }
    return this.props.children;
  }
}

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
  const { user, isGuest, profile, refreshProfile } = useAuth();
  const { owned, paragons, visualSeedOf, refresh: refreshCards } = useCardCollection();
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
  const [sellQuery, setSellQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hideOwned, setHideOwned] = useState(false);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const marketUnlocked = shopSpendUnlocked(profile?.shop_spent);
  const marketSpendLeft = shopSpendRemaining(profile?.shop_spent);

  useEffect(() => {
    const q = query.trim();
    const timer = window.setTimeout(() => setDebouncedQuery(q), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (force = false) => {
      if (force) setLoading(true);
      setError(null);
      try {
        const rows = await fetchMarketplaceListingsPage({
          offset: 0,
          force,
          revalidate: !force,
          onRevalidate: (fresh) => {
            setListings(fresh);
            offsetRef.current = fresh.length;
            setHasMore(fresh.length === MARKET_PAGE_SIZE);
          },
          query: debouncedQuery,
          tower: towerFilter,
          sort: sortKey,
        });
        setListings(rows);
        offsetRef.current = rows.length;
        setHasMore(rows.length === MARKET_PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load market.");
        if (force) {
          setListings([]);
          offsetRef.current = 0;
          setHasMore(false);
        }
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
    const cached = peekMarketplaceListingsPage({
      query: debouncedQuery,
      tower: towerFilter,
      sort: sortKey,
    });
    if (cached?.length) {
      setListings(cached);
      offsetRef.current = cached.length;
      setHasMore(cached.length === MARKET_PAGE_SIZE);
      setLoading(false);
    } else {
      setListings([]);
      setLoading(true);
    }
    void load();
  }, [load, debouncedQuery, towerFilter, sortKey]);

  useEffect(() => {
    if (showMineOnly) void loadMine();
  }, [showMineOnly, loadMine]);

  useEffect(() => {
    if (tab !== "browse" || showMineOnly || loading || !hasMore) return;
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
  }, [tab, showMineOnly, loading, hasMore, loadMore, listings.length]);

  const towersForSale = useMemo(
    () => baseTowers.map((t) => t.name).sort((a, b) => a.localeCompare(b)),
    [],
  );

  const browsedListings = useMemo(() => {
    let rows = listings;
    if (hideOwned) {
      rows = rows.filter((row) => !owned.has(row.cardId));
    }

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
  }, [listings, sortKey, hideOwned, owned]);

  const mineFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return myListings.filter((row) => {
      if (!q) return true;
      const card = cardSpecById(row.cardId);
      return card ? matchesCardQuery(card, q) : true;
    });
  }, [myListings, query]);

  const displayListings = showMineOnly ? mineFiltered : browsedListings;

  const sellOwnedCards = useMemo(() => {
    const q = sellQuery.trim().toLowerCase();
    let list = allCardSpecs().filter((c) => owned.has(c.id));
    if (q) list = list.filter((c) => matchesCardQuery(c, q));
    return list.slice().sort(sortCardSpecs).reverse();
  }, [owned, sellQuery]);

  const beginSell = (id: string) => {
    if (!marketUnlocked) return;
    setSelected(new Set([id]));
    setError(null);
    setStatus(null);
    const spec = cardSpecById(id);
    if (spec) {
      const deg = spec.isParagon ? (paragons.get(id)?.degree ?? 1) : 1;
      setPriceInput(String(suggestedListingRange(spec, deg).mid));
    } else {
      setPriceInput("100");
    }
    setSellStep("price");
    window.scrollTo(0, 0);
  };

  const sellCardId = [...selected][0] ?? null;
  const sellCard = sellCardId ? cardSpecById(sellCardId) : null;
  const sellRange = sellCard
    ? suggestedListingRange(
        sellCard,
        sellCard.isParagon ? (paragons.get(sellCard.id)?.degree ?? 1) : 1,
      )
    : null;

  const postListings = async (cardIds?: string[]) => {
    if (isGuest || !user) {
      setError("Sign in to sell cards.");
      return;
    }
    if (!marketUnlocked) {
      setError(
        `Spend ${MARKET_SHOP_SPEND_REQUIRED.toLocaleString()} Cash in the shop before listing cards.`,
      );
      return;
    }
    const price = Math.round(Number(priceInput));
    if (!Number.isFinite(price) || price < 10) {
      setError("Price must be at least 10 Cash.");
      return;
    }
    if (price > MAX_MARKET_PRICE) {
      setError(`Price can't be over ${MAX_MARKET_PRICE.toLocaleString()} Cash.`);
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
      setTab("browse");
      setShowMineOnly(true);
      setHideOwned(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list card.");
      await Promise.all([refreshCards(), load(true)]);
    }
    setBusyId(null);
  };

  const renderListing = (row: MarketplaceListing, mode: "browse" | "mine") => {
    const card = cardSpecById(row.cardId);
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
        </div>
      </article>
    );
  };

  return (
    <div className="market-page">
      <main className="market-main">
        <div className="market-page__top">
          <div className="market-page__shop-link">
            <MarketToShopLink />
          </div>
          <button
            type="button"
            className="market-page__refresh"
            onClick={() => {
              void load(true);
              if (showMineOnly) void loadMine();
            }}
            disabled={loading}
            aria-label="Refresh listings"
            title="Refresh"
          >
            Refresh
          </button>
        </div>

        <div className="market-tabs" role="tablist" aria-label="Marketplace">
          {(
            [
              ["browse", "Browse"],
              ["sell", "Sell"],
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
                setShowMineOnly(false);
                setHideOwned(false);
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
        ) : !marketUnlocked ? (
          <p className="market-banner">
            Spend {MARKET_SHOP_SPEND_REQUIRED.toLocaleString()} Cash in the shop
            before buying or listing. {marketSpendLeft.toLocaleString()} left.
          </p>
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
              <span className="visually-hidden">
                {showMineOnly
                  ? "Search your listings"
                  : "Search towers for sale"}
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  showMineOnly
                    ? "Search your listings…"
                    : "Search towers, upgrades, sellers…"
                }
                autoComplete="off"
              />
            </label>

            <div className="market-toolbar">
              <label className="market-toolbar__field">
                <span className="visually-hidden">Tower</span>
                <select
                  value={towerFilter}
                  onChange={(e) => setTowerFilter(e.target.value)}
                  aria-label="Filter by tower"
                  disabled={showMineOnly}
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
                <span className="visually-hidden">Sort</span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  aria-label="Sort listings"
                  disabled={showMineOnly}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="market-toolbar__toggles"
                role="group"
                aria-label="Listing filters"
              >
                <button
                  type="button"
                  className={`market-chip${hideOwned ? " is-on" : ""}`}
                  aria-pressed={hideOwned}
                  disabled={isGuest || showMineOnly}
                  onClick={() => setHideOwned((v) => !v)}
                >
                  Hide owned
                </button>
                <button
                  type="button"
                  className={`market-chip${showMineOnly ? " is-on" : ""}`}
                  aria-pressed={showMineOnly}
                  disabled={isGuest || !user}
                  onClick={() => {
                    setShowMineOnly((v) => !v);
                    setHideOwned(false);
                  }}
                >
                  Your listings
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "sell" ? (
          <SellErrorBoundary>
          <div className="market-sell-pick">
            {!marketUnlocked && !isGuest ? (
              <p className="market-empty">
                Spend {MARKET_SHOP_SPEND_REQUIRED.toLocaleString()} Cash in the
                shop before you can list cards. {marketSpendLeft.toLocaleString()}{" "}
                Cash left to unlock.
              </p>
            ) : sellStep === "pick" ? (
              <>
                <p className="market-sell-pick__lead">
                  Pick a card from your collection to list.
                </p>
                <label className="market-search">
                  <span className="visually-hidden">Search your cards</span>
                  <input
                    type="search"
                    value={sellQuery}
                    onChange={(e) => setSellQuery(e.target.value)}
                    placeholder="Search your cards…"
                    autoComplete="off"
                  />
                </label>
                {sellOwnedCards.length === 0 ? (
                  <p className="market-empty">
                    {isGuest
                      ? "Sign in to sell cards."
                      : sellQuery.trim()
                        ? "No owned cards match that search."
                        : "You have no cards to list."}
                  </p>
                ) : (
                  <VisibleCardGrid
                    items={sellOwnedCards}
                    getKey={(c) => c.id}
                    resetKey={sellQuery}
                    renderItem={(card) => (
                      <MonkeyCard
                        entity={card.entity}
                        pathLevels={card.pathLevels}
                        mode="preview"
                        owned
                        degree={
                          card.isParagon
                            ? (paragons.get(card.id)?.degree ?? 1)
                            : undefined
                        }
                        onSelect={
                          busyId != null || isGuest || !marketUnlocked
                            ? undefined
                            : () => beginSell(card.id)
                        }
                      />
                    )}
                  />
                )}
              </>
            ) : (
              <div className="market-sell-price">
                {sellCard ? (
                  <div className="market-sell-price__card">
                    <MonkeyCard
                      entity={sellCard.entity}
                      pathLevels={sellCard.pathLevels}
                      mode="preview"
                      owned
                      degree={
                        sellCard.isParagon
                          ? (paragons.get(sellCard.id)?.degree ?? 1)
                          : undefined
                      }
                      visualSeed={visualSeedOf(sellCard.id)}
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
                      max={MAX_MARKET_PRICE}
                      step={10}
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      autoFocus
                    />
                  </label>
                  {sellRange ? (
                    <p className="market-sell-price__hint">
                      Suggested range {formatListingRange(sellRange)} Cash
                      {sellCard?.isParagon
                        ? ` · degree ${paragons.get(sellCard.id)?.degree ?? 1}`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="market-sell-price__dock">
                  <p className="market-sell-price__note">
                    Listing this card takes it out of your collection until you
                    delete the listing.
                  </p>
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
          </SellErrorBoundary>
        ) : loading && !showMineOnly ? (
          <LoadingDots label="Loading marketplace" />
        ) : displayListings.length === 0 ? (
          <p className="market-empty">
            {showMineOnly
              ? query.trim()
                ? "No listings of yours match that search."
                : "You have no active listings. Open Sell to post cards."
              : listings.length === 0
                ? debouncedQuery
                  ? "No listings match that search."
                  : "No listings yet. Be the first to sell."
                : hideOwned
                  ? "No listings left after hiding cards you already own."
                  : "No listings match that search."}
          </p>
        ) : (
          <>
            <div className="market-section-head">
              <span>
                {showMineOnly
                  ? `${displayListings.length} of yours`
                  : `${displayListings.length}${hasMore ? "+" : ""} for sale`}
                {!showMineOnly && towerFilter !== "all"
                  ? ` · ${towerFilter}`
                  : ""}
              </span>
            </div>
            <div className="market-grid">
              {displayListings.map((row) =>
                renderListing(row, showMineOnly ? "mine" : "browse"),
              )}
            </div>
            {!showMineOnly && hasMore ? (
              <div ref={sentinelRef} className="market-more">
                {loadingMore ? (
                  <LoadingDots label="Loading more listings" />
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
