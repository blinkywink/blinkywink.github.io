import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { cardSpecById } from "../lib/cardCatalog";
import {
  fetchMarketOfferInbox,
  notifyMarketPartner,
  respondListingOffer,
  type MarketOffer,
  type MarketOfferInbox,
} from "../lib/marketplace";
import {
  cancelTrade,
  fetchTradeInbox,
  pingInbox,
  respondTrade,
  subscribeInboxChannel,
  type TradeInbox,
  type TradeInboxItem,
} from "../lib/trades";
import { listingPath, tradePath } from "../lib/routes";
import { CashAmount } from "./CurrencyChip";

const EMPTY_TRADES: TradeInbox = { incoming: [], outgoing: [], active: [] };
const EMPTY_OFFERS: MarketOfferInbox = { incoming: [], outgoing: [] };

export function TradeInbox() {
  const { user, refreshProfile } = useAuth();
  const { refresh: refreshCards } = useCardCollection();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<TradeInbox>(EMPTY_TRADES);
  const [offers, setOffers] = useState<MarketOfferInbox>(EMPTY_OFFERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevIncoming = useRef(0);
  const hydrated = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (force = false) => {
    if (!user) {
      setInbox(EMPTY_TRADES);
      setOffers(EMPTY_OFFERS);
      return;
    }
    try {
      const [nextTrades, nextOffers] = await Promise.all([
        fetchTradeInbox({ force }),
        fetchMarketOfferInbox({ force }).catch(() => EMPTY_OFFERS),
      ]);
      setInbox(nextTrades);
      setOffers(nextOffers);
      setError(null);

      const hot =
        nextTrades.incoming.length +
        nextTrades.active.length +
        nextOffers.incoming.length;

      if (!hydrated.current) {
        hydrated.current = true;
        prevIncoming.current = hot;
      } else if (hot > prevIncoming.current) {
        setOpen(true);
      }
      prevIncoming.current = hot;
    } catch {
      // Quiet — header shouldn't spam errors while offline
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setInbox(EMPTY_TRADES);
      setOffers(EMPTY_OFFERS);
      prevIncoming.current = 0;
      hydrated.current = false;
      setOpen(false);
      return;
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), 2500);
    const unsub = subscribeInboxChannel(user.id, () => {
      void refresh(true);
    });
    return () => {
      window.clearInterval(poll);
      unsub();
    };
  }, [user, refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const badge =
    inbox.incoming.length +
    inbox.active.length +
    inbox.outgoing.length +
    offers.incoming.length +
    offers.outgoing.length;

  if (badge === 0 && !open) return null;

  async function onAcceptTrade(item: TradeInboxItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await respondTrade(item.id, true);
      await pingInbox(item.partnerId).catch(() => undefined);
      setOpen(false);
      navigate(tradePath(item.id));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept.");
    }
    setBusyId(null);
  }

  async function onDeclineTrade(item: TradeInboxItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await respondTrade(item.id, false);
      await pingInbox(item.partnerId).catch(() => undefined);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline.");
    }
    setBusyId(null);
  }

  async function onCancelTrade(item: TradeInboxItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await cancelTrade(item.id);
      await pingInbox(item.partnerId).catch(() => undefined);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    }
    setBusyId(null);
  }

  async function onAcceptOffer(offer: MarketOffer) {
    setBusyId(offer.id);
    setError(null);
    try {
      await respondListingOffer(offer.id, true);
      await notifyMarketPartner(offer.partnerId);
      await Promise.all([refreshCards(), refreshProfile()]);
      setOpen(false);
      navigate(listingPath(offer.listingId));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept offer.");
    }
    setBusyId(null);
  }

  async function onDeclineOffer(offer: MarketOffer) {
    setBusyId(offer.id);
    setError(null);
    try {
      await respondListingOffer(offer.id, false);
      await notifyMarketPartner(offer.partnerId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline offer.");
    }
    setBusyId(null);
  }

  async function onCancelOffer(offer: MarketOffer) {
    setBusyId(offer.id);
    setError(null);
    try {
      await respondListingOffer(offer.id, false);
      await notifyMarketPartner(offer.partnerId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel offer.");
    }
    setBusyId(null);
  }

  function offerCardLabel(cardId: string): string {
    return cardSpecById(cardId)?.entity.name ?? "Card";
  }

  return (
    <div className="trade-inbox" ref={wrapRef}>
      <button
        type="button"
        className={`trade-inbox__pill${
          inbox.incoming.length + offers.incoming.length > 0 ? " is-hot" : ""
        }`}
        aria-label={`${badge} notification${badge === 1 ? "" : "s"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {badge > 9 ? "9+" : badge}
      </button>

      {open ? (
        <div className="trade-inbox__panel" role="dialog" aria-label="Inbox">
          <p className="trade-inbox__title">Inbox</p>
          {error ? <p className="trade-inbox__err">{error}</p> : null}

          {badge === 0 ? (
            <p className="trade-inbox__empty">Nothing waiting right now.</p>
          ) : null}

          {offers.incoming.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Market offers</h3>
              <ul>
                {offers.incoming.map((item) => {
                  const card = cardSpecById(item.cardId);
                  return (
                    <li key={item.id}>
                      <div className="trade-inbox__row trade-inbox__row--offer">
                        {card ? (
                          <img
                            className="trade-inbox__thumb"
                            src={card.entity.image}
                            alt=""
                            width={40}
                            height={40}
                          />
                        ) : null}
                        <span>
                          <strong>{item.partnerUsername}</strong> offered{" "}
                          <CashAmount amount={item.offerPrice} size={15} /> for{" "}
                          {offerCardLabel(item.cardId)}{" "}
                          <em>
                            (ask <CashAmount amount={item.listingPrice} size={13} />)
                          </em>
                        </span>
                        <div className="trade-inbox__actions">
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={busyId === item.id}
                            onClick={() => void onAcceptOffer(item)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={busyId === item.id}
                            onClick={() => void onDeclineOffer(item)}
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              setOpen(false);
                              navigate(listingPath(item.listingId));
                            }}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {offers.outgoing.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Your offers</h3>
              <ul>
                {offers.outgoing.map((item) => (
                  <li key={item.id}>
                    <div className="trade-inbox__row trade-inbox__row--offer">
                      <span>
                        <CashAmount amount={item.offerPrice} size={15} /> for{" "}
                        {offerCardLabel(item.cardId)} · waiting on{" "}
                        <strong>{item.partnerUsername}</strong>
                      </span>
                      <div className="trade-inbox__actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => {
                            setOpen(false);
                            navigate(listingPath(item.listingId));
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busyId === item.id}
                          onClick={() => void onCancelOffer(item)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {inbox.incoming.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Trade requests</h3>
              <ul>
                {inbox.incoming.map((item) => (
                  <li key={item.id}>
                    <div className="trade-inbox__row">
                      <span>
                        <strong>{item.partnerUsername}</strong> wants to trade
                      </span>
                      <div className="trade-inbox__actions">
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={busyId === item.id}
                          onClick={() => void onAcceptTrade(item)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busyId === item.id}
                          onClick={() => void onDeclineTrade(item)}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {inbox.active.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Open trades</h3>
              <ul>
                {inbox.active.map((item) => (
                  <li key={item.id}>
                    <div className="trade-inbox__row">
                      <span>
                        With <strong>{item.partnerUsername}</strong>
                      </span>
                      <div className="trade-inbox__actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => {
                            setOpen(false);
                            navigate(tradePath(item.id));
                          }}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busyId === item.id}
                          onClick={() => void onCancelTrade(item)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {inbox.outgoing.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Sent trades</h3>
              <ul>
                {inbox.outgoing.map((item) => (
                  <li key={item.id}>
                    <div className="trade-inbox__row">
                      <span>
                        Waiting on <strong>{item.partnerUsername}</strong>
                      </span>
                      <div className="trade-inbox__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busyId === item.id}
                          onClick={() => void onCancelTrade(item)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
