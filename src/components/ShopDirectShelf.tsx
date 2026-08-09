import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { cardSpecById } from "../lib/cardCatalog";
import {
  formatPathLevels,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import {
  buyShopDirectCard,
  fetchShopDirectListings,
  type ShopDirectListing,
} from "../lib/shopDirect";
import { CashAmount } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";

const POLL_MS = 8_000;

type FocusedDeal = {
  listing: ShopDirectListing;
  card: MonkeyCardSpec;
};

export function ShopDirectShelf() {
  const { isGuest, setCoinBalance } = useAuth();
  const { owned, refresh: refreshCards } = useCardCollection();
  const [listings, setListings] = useState<ShopDirectListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [focused, setFocused] = useState<FocusedDeal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const rows = await fetchShopDirectListings({ force });
      setListings(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load deals.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(true);
    const id = window.setInterval(() => void load(true), POLL_MS);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      closeFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [focused, busy]);

  function closeFocus() {
    if (busy) return;
    setFocused(null);
    setConfirmBuy(false);
  }

  function openFocus(listing: ShopDirectListing) {
    const card = cardSpecById(listing.cardId);
    if (!card) return;
    setError(null);
    setConfirmBuy(false);
    setFocused({ listing, card });
  }

  async function onConfirmPurchase() {
    if (!focused) return;
    const { listing, card } = focused;
    if (isGuest) {
      setError("Sign in to buy shop cards.");
      return;
    }
    if (owned.has(listing.cardId)) {
      setError("You already own that card.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await buyShopDirectCard(listing.slot, listing.version);
      setCoinBalance(result.coins);
      setListings(result.listings);
      await refreshCards();
      setStatus(
        `Bought ${card.entity.name} for ${result.price.toLocaleString()} Cash.`,
      );
      setFocused(null);
      setConfirmBuy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed.");
      await load(true);
      setFocused(null);
      setConfirmBuy(false);
    }
    setBusy(false);
  }

  const mineFocused = focused ? owned.has(focused.listing.cardId) : false;

  const focusPortal = focused
    ? createPortal(
        <div
          className="card-focus shop-direct-focus"
          role="dialog"
          aria-modal="true"
          aria-label={focused.card.entity.name}
        >
          <button
            type="button"
            className="card-focus__backdrop"
            aria-label="Close"
            disabled={busy}
            onClick={closeFocus}
          />
          <div className="card-focus__panel shop-direct-focus__panel">
            <button
              type="button"
              className="btn btn--ghost btn--sm card-focus__close"
              disabled={busy}
              onClick={closeFocus}
            >
              ✕ Close
            </button>
            <MonkeyCard
              entity={focused.card.entity}
              pathLevels={focused.card.pathLevels}
              mode="focus"
              owned
            />
            <div className="shop-direct-focus__meta">
              <p className="shop-direct-focus__name">
                {focused.card.entity.name}
              </p>
              <p className="shop-direct-focus__sub">
                {formatPathLevels(focused.card.pathLevels)} ·{" "}
                {focused.card.tower} · T{focused.listing.tier}
              </p>
              <CashAmount
                amount={focused.listing.price}
                size={24}
                className="shop-direct-focus__price"
              />
            </div>
            <div className="shop-direct-focus__actions">
              {isGuest ? (
                <p className="shop-direct-focus__hint">Sign in to buy.</p>
              ) : mineFocused ? (
                <p className="shop-direct-focus__hint">You already own this.</p>
              ) : !confirmBuy ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => setConfirmBuy(true)}
                >
                  Buy
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => setConfirmBuy(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void onConfirmPurchase()}
                  >
                    {busy ? "Buying…" : "Confirm"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <section className="shop-direct" aria-label="Limited cards">
      <div className="pack-shelf__head pack-shelf__head--sub">
        <h3 className="section-label">Limited cards</h3>
        <p className="shop-direct__note">
          Shared stock · T4 7,500 · T5 25,000 · unsold after 3 days auto-cycles
        </p>
      </div>

      {error ? (
        <p className="shop-direct__banner shop-direct__banner--err">{error}</p>
      ) : null}
      {status ? (
        <p className="shop-direct__banner shop-direct__banner--ok">{status}</p>
      ) : null}

      {loading && listings.length === 0 ? (
        <p className="shop-direct__empty">Loading deals…</p>
      ) : (
        <div className="shop-direct__grid">
          {listings.map((row) => {
            const card = cardSpecById(row.cardId);
            return (
              <article
                key={`${row.slot}-${row.version}-${row.cardId}`}
                className="shop-direct__card"
              >
                {card ? (
                  <MonkeyCard
                    entity={card.entity}
                    pathLevels={card.pathLevels}
                    mode="preview"
                    owned
                    onSelect={() => openFocus(row)}
                  />
                ) : (
                  <button
                    type="button"
                    className="shop-direct__missing"
                    onClick={() => openFocus(row)}
                  >
                    {row.cardId}
                  </button>
                )}
                <div className="shop-direct__meta">
                  <p className="shop-direct__name">
                    {card ? card.entity.name : row.cardId}
                  </p>
                  <CashAmount amount={row.price} size={18} />
                </div>
              </article>
            );
          })}
        </div>
      )}
      {focusPortal}
    </section>
  );
}
