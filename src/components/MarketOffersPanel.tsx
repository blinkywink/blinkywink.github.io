import { useCallback, useEffect, useState } from "react";
import { cardSpecById } from "../lib/cardCatalog";
import {
  fetchCollectionOffers,
  ignoreCollectionOffers,
  respondCollectionOffer,
  type CollectionOffer,
} from "../lib/marketplace";
import { formatPathLevels } from "../lib/pathCombos";
import { CashAmount } from "./CurrencyChip";

type Props = {
  onAccepted: () => void;
  onChanged?: (incoming: number) => void;
};

function cardLabel(cardId: string): { name: string; detail: string } {
  const card = cardSpecById(cardId);
  if (!card) return { name: cardId, detail: "" };
  return {
    name: card.entity.name,
    detail: card.isParagon ? "Paragon" : formatPathLevels(card.pathLevels),
  };
}

export function MarketOffersPanel({ onAccepted, onChanged }: Props) {
  const [incoming, setIncoming] = useState<CollectionOffer[]>([]);
  const [outgoing, setOutgoing] = useState<CollectionOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
            {incoming.map((offer) => {
              const label = cardLabel(offer.cardId);
              return (
                <li key={offer.id} className="market-offers__card">
                  <div className="market-offers__copy">
                    <strong>{label.name}</strong>
                    <span>
                      {label.detail ? `${label.detail} · ` : ""}
                      from {offer.partnerUsername}
                    </span>
                  </div>
                  <CashAmount amount={offer.offerPrice} size={18} />
                  <div className="market-offers__actions">
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="market-offers__section">
        <h2>Your offers</h2>
        {outgoing.length === 0 ? (
          <p className="market-empty">You have no pending offers.</p>
        ) : (
          <ul className="market-offers__list">
            {outgoing.map((offer) => {
              const label = cardLabel(offer.cardId);
              return (
                <li key={offer.id} className="market-offers__card">
                  <div className="market-offers__copy">
                    <strong>{label.name}</strong>
                    <span>
                      {label.detail ? `${label.detail} · ` : ""}
                      waiting on {offer.partnerUsername}
                    </span>
                  </div>
                  <CashAmount amount={offer.offerPrice} size={18} />
                  <div className="market-offers__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busyId != null}
                      onClick={() => void onRespond(offer, false)}
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
