import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { cardSpecById } from "../lib/cardCatalog";
import {
  buyListing,
  cancelListing,
  fetchListingOffers,
  fetchMarketplaceListing,
  makeListingOffer,
  notifyMarketPartner,
  respondListingOffer,
  type ListingOfferRow,
  type MarketplaceListing,
} from "../lib/marketplace";
import { formatPathLevels, maxPathTier } from "../lib/pathCombos";
import { marketplacePath, userCollectionPath } from "../lib/routes";
import { CashAmount } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";
import { PageHeader } from "./PageHeader";
import { UserAvatar } from "./UserAvatar";

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

export function ListingPage() {
  const { listingId = "" } = useParams();
  const navigate = useNavigate();
  const { user, profile, isGuest, setCoinBalance, refreshProfile } = useAuth();
  const { owned, refresh: refreshCards } = useCardCollection();

  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [offers, setOffers] = useState<ListingOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offerInput, setOfferInput] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);

  const load = useCallback(async () => {
    if (!listingId) return;
    setLoading(true);
    setError(null);
    try {
      const row = await fetchMarketplaceListing(listingId);
      setListing(row);
      if (row && user && !isGuest) {
        const nextOffers = await fetchListingOffers(row.id).catch(() => []);
        setOffers(nextOffers);
      } else {
        setOffers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listing.");
      setListing(null);
    }
    setLoading(false);
  }, [listingId, user, isGuest]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!listing) return;
    setOfferInput(String(Math.max(10, Math.floor(listing.price * 0.85))));
  }, [listing?.id, listing?.price]);

  const card = useMemo(
    () => (listing ? cardSpecById(listing.cardId) : null),
    [listing],
  );

  const mine = Boolean(user && listing && user.id === listing.sellerId);
  const active = listing?.status === "active";
  const alreadyOwn = listing ? owned.has(listing.cardId) : false;
  const myOffer = offers.find((o) => o.buyerId === user?.id) ?? null;
  const canBuy =
    active &&
    !mine &&
    !isGuest &&
    !alreadyOwn &&
    (profile?.coins ?? 0) >= (listing?.price ?? Infinity);

  const pathLabel = card
    ? card.isParagon
      ? "Paragon"
      : formatPathLevels(card.pathLevels)
    : "";
  const tier = card
    ? card.isParagon
      ? "P"
      : String(maxPathTier(card.pathLevels))
    : "";

  async function onBuy() {
    if (!listing) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const bal = await buyListing(listing.id);
      setCoinBalance(bal);
      await Promise.all([refreshCards(), refreshProfile()]);
      setStatus("Bought — card added to your collection.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed.");
    }
    setBusy(false);
  }

  async function onCancelListing() {
    if (!listing) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await cancelListing(listing.id);
      await refreshCards();
      setStatus("Listing cancelled. Card returned.");
      navigate(marketplacePath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
    }
    setBusy(false);
  }

  async function onMakeOffer() {
    if (!listing) return;
    const price = Math.round(Number(offerInput));
    if (!Number.isFinite(price) || price < 10) {
      setError("Offer must be at least 10 Cash.");
      return;
    }
    if (price >= listing.price) {
      setError("Offer must be lower than the asking price.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await makeListingOffer(listing.id, price);
      await notifyMarketPartner(listing.sellerId);
      await refreshProfile();
      setStatus(
        `Offer sent: ${price.toLocaleString()} Cash locked until they respond.`,
      );
      setOfferOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send offer.");
    }
    setBusy(false);
  }

  async function onRespondOffer(offer: ListingOfferRow, accept: boolean) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const bal = await respondListingOffer(offer.id, accept);
      await notifyMarketPartner(
        mine ? offer.buyerId : listing?.sellerId ?? offer.buyerId,
      );
      if (accept) {
        // RPC returns the buyer's balance; sellers just refresh profile Cash.
        if (bal != null && !mine) setCoinBalance(bal);
        await Promise.all([refreshCards(), refreshProfile()]);
        setStatus(
          mine
            ? `Accepted ${offer.offerPrice.toLocaleString()} Cash from ${offer.buyerUsername}.`
            : "Offer accepted — card is yours!",
        );
      } else if (mine) {
        setStatus("Offer declined.");
      } else {
        setStatus("Offer cancelled.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update offer.");
    }
    setBusy(false);
  }

  if (loading && !listing) {
    return (
      <div className="listing-page">
        <PageHeader title="Listing" blurb="Loading…" />
        <p className="market-empty">Loading listing…</p>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="listing-page">
        <PageHeader title="Listing" />
        <p className="market-banner market-banner--err">
          {error ?? "Listing not found."}
        </p>
        <Link className="btn btn--ghost" to={marketplacePath()}>
          ← Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="listing-page">
      <div className="listing-page__top">
        <Link className="btn btn--ghost btn--sm" to={marketplacePath()}>
          ← Market
        </Link>
        <PageHeader
          eyebrow={active ? "For sale" : listing.status ?? "Listing"}
          title={card?.entity.name ?? listing.cardId}
          blurb={
            card
              ? `${card.tower} · ${pathLabel}${tier ? ` · T${tier}` : ""}`
              : undefined
          }
        />
      </div>

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

      <div className="listing-layout">
        <div className="listing-showcase">
          {card ? (
            <MonkeyCard
              entity={card.entity}
              pathLevels={card.pathLevels}
              mode="focus"
              owned
            />
          ) : (
            <div className="market-card__missing">{listing.cardId}</div>
          )}
        </div>

        <aside className="listing-panel">
          <div className="listing-ask">
            <span className="listing-ask__label">Asking</span>
            <CashAmount
              amount={listing.price}
              className="cash-amount--lg listing-ask__price"
              size={28}
            />
            <span className="listing-ask__time">
              Posted {formatPostedAt(listing.createdAt)}
            </span>
          </div>

          <Link
            className="listing-seller"
            to={userCollectionPath(listing.sellerUsername)}
          >
            <UserAvatar crop={listing.sellerAvatar} size={44} />
            <span>
              <strong>{listing.sellerUsername}</strong>
              <em>Seller</em>
            </span>
          </Link>

          {!active ? (
            <p className="listing-note">This listing is no longer active.</p>
          ) : mine ? (
            <div className="listing-actions">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => void onCancelListing()}
              >
                Cancel listing
              </button>
            </div>
          ) : isGuest ? (
            <p className="listing-note">Sign in to buy or make an offer.</p>
          ) : alreadyOwn ? (
            <p className="listing-note">You already own this card.</p>
          ) : (
            <div className="listing-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !canBuy}
                onClick={() => void onBuy()}
              >
                {busy ? (
                  "Working…"
                ) : (
                  <>
                    Buy for <CashAmount amount={listing.price} size={16} />
                  </>
                )}
              </button>

              {myOffer ? (
                <div className="listing-my-offer">
                  <p>
                    Your offer:{" "}
                    <CashAmount amount={myOffer.offerPrice} size={16} /> ·
                    waiting on seller
                  </p>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => void onRespondOffer(myOffer, false)}
                  >
                    Cancel offer
                  </button>
                </div>
              ) : (
                <>
                  {!offerOpen ? (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={busy}
                      onClick={() => setOfferOpen(true)}
                    >
                      Make offer
                    </button>
                  ) : (
                    <div className="listing-offer-form">
                      <label>
                        <span>Your offer</span>
                        <input
                          type="number"
                          min={10}
                          max={listing.price - 1}
                          step={10}
                          value={offerInput}
                          onChange={(e) => setOfferInput(e.target.value)}
                        />
                      </label>
                      <p className="listing-offer-hint">
                        Must be under{" "}
                        <CashAmount amount={listing.price} size={14} />. Your
                        Cash is locked until they accept, decline, or you
                        cancel.
                      </p>
                      <div className="listing-offer-form__row">
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={busy}
                          onClick={() => void onMakeOffer()}
                        >
                          Send offer
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy}
                          onClick={() => setOfferOpen(false)}
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {mine && active && offers.length > 0 ? (
            <section className="listing-offers">
              <h3>Offers ({offers.length})</h3>
              <ul>
                {offers.map((offer) => (
                  <li key={offer.id} className="listing-offer-row">
                    <div className="listing-offer-row__meta">
                      <CashAmount amount={offer.offerPrice} size={18} />
                      <span>from {offer.buyerUsername}</span>
                    </div>
                    <div className="listing-offer-row__actions">
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={busy}
                        onClick={() => void onRespondOffer(offer, true)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={() => void onRespondOffer(offer, false)}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
