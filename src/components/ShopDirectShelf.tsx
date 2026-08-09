import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { cardSpecById } from "../lib/cardCatalog";
import { formatPathLevels } from "../lib/pathCombos";
import {
  buyShopDirectCard,
  fetchShopDirectListings,
  type ShopDirectListing,
} from "../lib/shopDirect";
import { CashAmount } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";

const POLL_MS = 8_000;

export function ShopDirectShelf() {
  const { isGuest, setCoinBalance } = useAuth();
  const { owned, refresh: refreshCards } = useCardCollection();
  const [listings, setListings] = useState<ShopDirectListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState<number | null>(null);
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

  async function onBuy(row: ShopDirectListing) {
    if (isGuest) {
      setError("Sign in to buy shop cards.");
      return;
    }
    if (owned.has(row.cardId)) {
      setError("You already own that card.");
      return;
    }
    setBusySlot(row.slot);
    setError(null);
    setStatus(null);
    try {
      const result = await buyShopDirectCard(row.slot, row.version);
      setCoinBalance(result.coins);
      setListings(result.listings);
      await refreshCards();
      const card = cardSpecById(result.boughtCardId);
      setStatus(
        card
          ? `Bought ${card.entity.name} for ${result.price.toLocaleString()} Cash.`
          : `Bought card for ${result.price.toLocaleString()} Cash.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed.");
      await load(true);
    }
    setBusySlot(null);
  }

  return (
    <section className="shop-direct" aria-label="Limited cards">
      <div className="pack-shelf__head pack-shelf__head--sub">
        <h3 className="section-label">Limited cards</h3>
        <p className="shop-direct__note">
          Shared stock · T4 7,500 · T5 25,000 · one buyer each
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
            const mine = owned.has(row.cardId);
            const busy = busySlot === row.slot;
            return (
              <article key={`${row.slot}-${row.version}-${row.cardId}`} className="shop-direct__card">
                {card ? (
                  <MonkeyCard
                    entity={card.entity}
                    pathLevels={card.pathLevels}
                    mode="preview"
                    owned
                  />
                ) : (
                  <div className="shop-direct__missing">{row.cardId}</div>
                )}
                <div className="shop-direct__meta">
                  <span className={`shop-direct__tier is-t${row.tier}`}>
                    T{row.tier}
                  </span>
                  {card ? (
                    <p className="shop-direct__name">
                      {card.entity.name}
                      <span>
                        {formatPathLevels(card.pathLevels)} · {card.tower}
                      </span>
                    </p>
                  ) : null}
                  <CashAmount amount={row.price} size={18} />
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={busy || busySlot != null || mine || isGuest}
                    onClick={() => void onBuy(row)}
                  >
                    {busy
                      ? "Buying…"
                      : mine
                        ? "Owned"
                        : isGuest
                          ? "Sign in"
                          : "Buy"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
