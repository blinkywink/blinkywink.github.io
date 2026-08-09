import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { cardSpecById, matchesCardQuery } from "../lib/cardCatalog";
import {
  buyListing,
  cancelListing,
  fetchMarketplaceListings,
  listCardForSale,
  type MarketplaceListing,
} from "../lib/marketplace";
import { maxPathTier, type MonkeyCardSpec } from "../lib/pathCombos";
import { userCollectionPath } from "../lib/routes";
import { CardChip } from "./CardChip";
import { GameHeader } from "./GameHeader";
import { MonkeyCard } from "./MonkeyCard";
import { OwnedCardPicker } from "./OwnedCardPicker";
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
  const { user, profile, isGuest, setCoinBalance, refreshProfile } = useAuth();
  const { owned, refresh: refreshCards } = useCardCollection();
  const [tab, setTab] = useState<Tab>("browse");
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [towerFilter, setTowerFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priceInput, setPriceInput] = useState("100");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMarketplaceListings();
      setListings(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market.");
      setListings([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const towersForSale = useMemo(() => {
    const names = new Set<string>();
    for (const row of listings) {
      const card = cardSpecById(row.cardId);
      if (card?.tower) names.add(card.tower);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [listings]);

  const browsedListings = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = listings;

    if (towerFilter !== "all") {
      rows = rows.filter((row) => cardSpecById(row.cardId)?.tower === towerFilter);
    }

    if (q) {
      rows = rows.filter((row) => {
        if (row.sellerUsername.toLowerCase().includes(q)) return true;
        const card = cardSpecById(row.cardId);
        if (!card) return row.cardId.toLowerCase().includes(q);
        return matchesCardQuery(card, q);
      });
    }

    const sorted = rows.slice().sort((a, b) => {
      const ca = cardSpecById(a.cardId);
      const cb = cardSpecById(b.cardId);
      switch (sortKey) {
        case "price-asc":
          return a.price - b.price || Date.parse(b.createdAt) - Date.parse(a.createdAt);
        case "price-desc":
          return b.price - a.price || Date.parse(b.createdAt) - Date.parse(a.createdAt);
        case "tier-desc":
          return (
            listingTier(cb) - listingTier(ca) ||
            a.price - b.price ||
            Date.parse(b.createdAt) - Date.parse(a.createdAt)
          );
        case "tier-asc":
          return (
            listingTier(ca) - listingTier(cb) ||
            a.price - b.price ||
            Date.parse(b.createdAt) - Date.parse(a.createdAt)
          );
        case "tower": {
          const ta = ca?.tower ?? "";
          const tb = cb?.tower ?? "";
          return (
            ta.localeCompare(tb) ||
            listingTier(cb) - listingTier(ca) ||
            a.price - b.price
          );
        }
        case "newest":
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }
    });

    return sorted;
  }, [listings, query, towerFilter, sortKey]);

  const myListings = useMemo(() => {
    const mine = user ? listings.filter((l) => l.sellerId === user.id) : [];
    return mine.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [listings, user]);

  const selectedList = useMemo(() => [...selected], [selected]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const postListings = async () => {
    if (isGuest || !user) {
      setError("Sign in to sell cards.");
      return;
    }
    const price = Math.round(Number(priceInput));
    if (!Number.isFinite(price) || price < 10) {
      setError("Price must be at least 10 Cash.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one card to sell.");
      return;
    }
    setBusyId("sell");
    setError(null);
    setStatus(null);
    let ok = 0;
    try {
      for (const cardId of selected) {
        await listCardForSale(cardId, price);
        ok += 1;
      }
      setSelected(new Set());
      setStatus(
        ok === 1
          ? "Listed 1 card."
          : `Listed ${ok} cards at ${price.toLocaleString()} Cash each.`,
      );
      await Promise.all([refreshCards(), load()]);
      setTab("mine");
    } catch (err) {
      setError(
        err instanceof Error
          ? ok > 0
            ? `${ok} listed, then: ${err.message}`
            : err.message
          : "Could not list cards.",
      );
      await Promise.all([refreshCards(), load()]);
    }
    setBusyId(null);
  };

  const onBuy = async (listing: MarketplaceListing) => {
    if (isGuest || !user) {
      setError("Sign in to buy cards.");
      return;
    }
    setBusyId(listing.id);
    setError(null);
    setStatus(null);
    try {
      const bal = await buyListing(listing.id);
      setCoinBalance(bal);
      await Promise.all([refreshCards(), refreshProfile(), load()]);
      setStatus(`Bought card from ${listing.sellerUsername}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed.");
      await load();
    }
    setBusyId(null);
  };

  const onCancel = async (listing: MarketplaceListing) => {
    setBusyId(listing.id);
    setError(null);
    setStatus(null);
    try {
      await cancelListing(listing.id);
      await Promise.all([refreshCards(), load()]);
      setStatus("Listing cancelled. Card returned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
      await load();
    }
    setBusyId(null);
  };

  const renderListing = (row: MarketplaceListing, mode: "browse" | "mine") => {
    const card = cardSpecById(row.cardId);
    const mine = user?.id === row.sellerId;
    const tier = listingTier(card);
    return (
      <article key={row.id} className="market-card">
        {card ? (
          <MonkeyCard
            entity={card.entity}
            pathLevels={card.pathLevels}
            mode="preview"
            owned
          />
        ) : (
          <div className="market-card__missing">{row.cardId}</div>
        )}
        <div className="market-card__meta">
          <strong>{row.price.toLocaleString()} Cash</strong>
          <span className="market-card__tags">
            {card ? card.tower : "Unknown"}
            {tier >= 0 ? ` · T${tier === 6 ? "P" : tier}` : ""}
          </span>
          {mode === "browse" ? (
            <Link
              className="market-card__seller"
              to={userCollectionPath(row.sellerUsername)}
            >
              <UserAvatar crop={row.sellerAvatar} size={22} />
              <span>{row.sellerUsername}</span>
            </Link>
          ) : (
            <span className="market-card__seller">Your listing</span>
          )}
          <span className="market-card__time">{formatPostedAt(row.createdAt)}</span>
          {mode === "mine" || mine ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busyId === row.id}
              onClick={() => void onCancel(row)}
            >
              {busyId === row.id ? "…" : "Cancel"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={
                busyId === row.id ||
                isGuest ||
                (profile?.coins ?? 0) < row.price ||
                owned.has(row.cardId)
              }
              onClick={() => void onBuy(row)}
            >
              {owned.has(row.cardId)
                ? "Owned"
                : busyId === row.id
                  ? "Buying…"
                  : "Buy"}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="market-page">
      <GameHeader title="MARKETPLACE" icon="" />
      <main className="market-main">
        <p className="market-sub">
          Recently posted cards from players. Search towers and sort to find deals.
        </p>

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
          <label className="market-search">
            <span className="market-search__label">
              {tab === "mine" ? "Search your listings" : "Search towers for sale"}
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tower name, upgrade, seller…"
              autoComplete="off"
            />
          </label>
        ) : null}

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
          </div>
        ) : null}

        {tab === "sell" ? (
          <div className="market-sell-bar">
            <label className="market-price">
              <span>Price each</span>
              <input
                type="number"
                min={10}
                step={10}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busyId != null || selected.size === 0 || isGuest}
              onClick={() => void postListings()}
            >
              {busyId === "sell"
                ? "Listing…"
                : selected.size
                  ? `List ${selected.size}`
                  : "List"}
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="market-empty">Loading…</p>
        ) : tab === "browse" ? (
          browsedListings.length === 0 ? (
            <p className="market-empty">
              {listings.length === 0
                ? "No listings yet. Be the first to sell."
                : "No listings match that search."}
            </p>
          ) : (
            <>
              <div className="market-section-head">
                <h3>
                  {sortKey === "newest" ? "Recently posted" : "Listings"}
                </h3>
                <span>
                  {browsedListings.length} for sale
                  {towerFilter !== "all" ? ` · ${towerFilter}` : ""}
                </span>
              </div>
              <div className="market-grid">
                {browsedListings.map((row) => renderListing(row, "browse"))}
              </div>
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
            {selectedList.length > 0 ? (
              <div className="market-selected">
                <p className="market-selected__label">
                  Selected ({selectedList.length})
                </p>
                <div className="owned-picker__chips">
                  {selectedList.map((id) => (
                    <CardChip
                      key={id}
                      cardId={id}
                      selected
                      disabled={busyId != null || isGuest}
                      actionLabel="Remove"
                      onClick={() => toggleSelect(id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="market-empty">
                Pick towers below or search — then list at one price.
              </p>
            )}
            <OwnedCardPicker
              owned={owned}
              selectedIds={selected}
              disabled={busyId != null || isGuest}
              onToggle={toggleSelect}
            />
          </div>
        )}

        <button
          type="button"
          className="btn btn--ghost btn--sm market-refresh"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      </main>
    </div>
  );
}
