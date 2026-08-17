import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { cardSpecById } from "../lib/cardCatalog";
import {
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import {
  buyShopDirectCard,
  fetchShopDirectListings,
  formatShopDirectCountdown,
  shopDirectExpiresAtMs,
  type ShopDirectListing,
} from "../lib/shopDirect";
import { playBuy, playCardFocus, preloadPackSounds } from "../lib/packSounds";
import { isTypingTarget } from "../lib/keyboard";
import { CashAmount } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";

const POLL_MS = 8_000;

type FocusedDeal = {
  listing: ShopDirectListing;
  card: MonkeyCardSpec;
};

export function ShopDirectShelf() {
  const { isGuest, profile, setCoinBalance, refreshProfile } = useAuth();
  const { owned, refresh: refreshCards, feedParagonsFromCards } = useCardCollection();
  const [listings, setListings] = useState<ShopDirectListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<FocusedDeal | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      // When any listing expires, force a refresh so the server can rotate it.
      if (listings.some((row) => shopDirectExpiresAtMs(row) <= t)) {
        void load(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [listings, load]);

  function closeFocus() {
    if (busy) return;
    setFocused(null);
    setBuyError(null);
  }

  function openFocus(listing: ShopDirectListing) {
    const card = cardSpecById(listing.cardId);
    if (!card) return;
    setError(null);
    setBuyError(null);
    preloadPackSounds();
    playCardFocus();
    setFocused({ listing, card });
  }

  async function onPurchase() {
    if (!focused || busy) return;
    const { listing, card } = focused;
    if (isGuest) {
      setBuyError("Sign in to buy shop cards.");
      return;
    }
    if (owned.has(listing.cardId)) {
      setBuyError("You already own that card.");
      return;
    }
    if ((profile?.coins ?? 0) < listing.price) {
      setBuyError("Not enough Cash.");
      return;
    }
    setBusy(true);
    setBuyError(null);
    setError(null);
    setStatus(null);
    try {
      const result = await buyShopDirectCard(listing.slot, listing.version);
      playBuy();
      setCoinBalance(result.coins);
      setListings(result.listings);
      const wasNew = !owned.has(card.id);
      await refreshCards();
      void refreshProfile();
      await feedParagonsFromCards([card.id], wasNew ? [card.id] : []);
      setStatus(
        `Bought ${card.entity.name} for ${result.price.toLocaleString()} Cash.`,
      );
      setFocused(null);
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Purchase failed.");
      await load(true);
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (busy) return;
        e.preventDefault();
        closeFocus();
        return;
      }
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.repeat || busy) return;
      void onPurchase();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  });

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
            <div className="card-focus__face">
              <button
                type="button"
                className="btn btn--ghost btn--sm card-focus__close"
                aria-label="Close"
                disabled={busy}
                onClick={closeFocus}
              >
                ✕
              </button>
              <MonkeyCard
                entity={focused.card.entity}
                pathLevels={focused.card.pathLevels}
                mode="focus"
                owned
              />
            </div>
            <div className="pack-opener__buy shop-direct-focus__buy">
              {isGuest ? (
                <p className="pack-opener__buy-note">Sign in to buy.</p>
              ) : mineFocused ? (
                <p className="pack-opener__buy-note">You already own this.</p>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={busy}
                    onClick={() => void onPurchase()}
                  >
                    {busy ? (
                      "Buying…"
                    ) : (
                      <>
                        Purchase for{" "}
                        <CashAmount
                          amount={focused.listing.price}
                          size={22}
                        />
                      </>
                    )}
                  </button>
                  {buyError ? (
                    <p className="pack-opener__buy-error">{buyError}</p>
                  ) : null}
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
                  <p className="shop-direct__timer" aria-label="Time until refresh">
                    {formatShopDirectCountdown(row, now)}
                  </p>
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
