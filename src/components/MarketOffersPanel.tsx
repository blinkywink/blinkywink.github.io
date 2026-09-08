import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cardSpecById } from "../lib/cardCatalog";
import {
  fetchCollectionOffers,
  ignoreCollectionOffers,
  respondCollectionOffer,
  type CollectionOffer,
} from "../lib/marketplace";
import { CashAmount } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";
import { UserAvatar } from "./UserAvatar";

type Props = {
  onAccepted: () => void;
  onChanged?: (incoming: number) => void;
};

function OfferThumb({
  cardId,
  visualSeed,
  degree,
  label,
  onOpen,
}: {
  cardId: string;
  visualSeed: number | null;
  degree: number | null;
  label: string;
  onOpen: () => void;
}) {
  const card = cardSpecById(cardId);
  if (!card) return null;
  return (
    <button
      type="button"
      className="offer-thumb"
      aria-label={`View ${label}`}
      onClick={onOpen}
    >
      <MonkeyCard
        entity={card.entity}
        pathLevels={card.pathLevels}
        mode="preview"
        owned
        staticArt
        degree={card.isParagon ? (degree ?? 1) : undefined}
        visualSeed={visualSeed}
      />
    </button>
  );
}

function OfferFocus({
  offer,
  onClose,
}: {
  offer: CollectionOffer;
  onClose: () => void;
}) {
  const card = cardSpecById(offer.cardId);
  if (!card) return null;
  return createPortal(
    <div className="card-focus" role="dialog" aria-modal="true" aria-label={card.entity.name}>
      <button
        type="button"
        className="card-focus__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="card-focus__panel">
        <div className="card-focus__face">
          <button
            type="button"
            className="btn btn--ghost btn--sm card-focus__close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
          <MonkeyCard
            entity={card.entity}
            pathLevels={card.pathLevels}
            mode="focus"
            owned
            degree={card.isParagon ? (offer.paragonDegree ?? 1) : undefined}
            visualSeed={offer.visualSeed}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function OfferRow({
  offer,
  busy,
  onOpen,
  children,
}: {
  offer: CollectionOffer;
  busy: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const card = cardSpecById(offer.cardId);
  const label = card?.entity.name ?? offer.cardId;
  return (
    <li className="market-offers__card">
      <OfferThumb
        cardId={offer.cardId}
        visualSeed={offer.visualSeed}
        degree={offer.paragonDegree}
        label={label}
        onOpen={onOpen}
      />
      <span className="offer-owner">
        <UserAvatar
          crop={offer.partnerAvatar}
          size={28}
          alt=""
        />
        <span>{offer.partnerUsername}</span>
      </span>
      <CashAmount amount={offer.offerPrice} size={16} />
      <div className="market-offers__actions">{children}</div>
      {busy ? <span className="visually-hidden">Working</span> : null}
    </li>
  );
}

export function MarketOffersPanel({ onAccepted, onChanged }: Props) {
  const [incoming, setIncoming] = useState<CollectionOffer[]>([]);
  const [outgoing, setOutgoing] = useState<CollectionOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [focused, setFocused] = useState<CollectionOffer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchCollectionOffers({ force: true });
      setIncoming(next.incoming);
      setOutgoing(next.outgoing);
      onChanged?.(next.incoming.length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load offers.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRespond(offer: CollectionOffer, accept: boolean) {
    setBusyId(offer.id);
    setError(null);
    setStatus(null);
    try {
      await respondCollectionOffer(offer.id, accept);
      if (accept) {
        setStatus("Offer accepted. Cash added, card sent.");
        onAccepted();
      }
      if (focused?.id === offer.id) setFocused(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update offer.");
    }
    setBusyId(null);
  }

  async function onIgnoreAll() {
    setBusyId("all");
    setError(null);
    setStatus(null);
    try {
      const n = await ignoreCollectionOffers();
      setStatus(n > 0 ? "Ignored all offers." : "No offers to ignore.");
      setFocused(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ignore offers.");
    }
    setBusyId(null);
  }

  if (loading && incoming.length === 0 && outgoing.length === 0) {
    return <p className="market-banner">Loading offers…</p>;
  }

  return (
    <div className="market-offers">
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

      <section className="market-offers__section">
        <h2>Your offers</h2>
        {outgoing.length === 0 ? (
          <p className="market-empty">You have no pending offers.</p>
        ) : (
          <ul className="market-offers__list">
            {outgoing.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                busy={busyId != null}
                onOpen={() => setFocused(offer)}
              >
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busyId != null}
                  onClick={() => void onRespond(offer, false)}
                >
                  Cancel
                </button>
              </OfferRow>
            ))}
          </ul>
        )}
      </section>

      <section className="market-offers__section">
        <div className="market-offers__head">
          <h2>On your cards</h2>
          {incoming.length > 0 ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busyId != null}
              onClick={() => void onIgnoreAll()}
            >
              Ignore all
            </button>
          ) : null}
        </div>
        {incoming.length === 0 ? (
          <p className="market-empty">No offers waiting.</p>
        ) : (
          <ul className="market-offers__list">
            {incoming.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                busy={busyId != null}
                onOpen={() => setFocused(offer)}
              >
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busyId != null}
                  onClick={() => void onRespond(offer, true)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busyId != null}
                  onClick={() => void onRespond(offer, false)}
                >
                  Decline
                </button>
              </OfferRow>
            ))}
          </ul>
        )}
      </section>

      {focused ? <OfferFocus offer={focused} onClose={() => setFocused(null)} /> : null}
    </div>
  );
}
