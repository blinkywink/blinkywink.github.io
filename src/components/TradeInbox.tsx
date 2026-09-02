import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { cardSpecById } from "../lib/cardCatalog";
import { categoryShell } from "../lib/cardCategoryTheme";
import {
  ackMarketSaleNotices,
  fetchMarketOfferInbox,
  fetchMarketSaleNotices,
  notifyMarketPartner,
  respondListingOffer,
  type MarketOffer,
  type MarketOfferInbox,
  type MarketSaleNotice,
} from "../lib/marketplace";
import {
  cancelExchange,
  confirmExchange,
  fetchExchangeInbox,
  respondExchange,
  type ExchangeInbox,
  type ExchangeInboxItem,
} from "../lib/exchanges";
import {
  cancelTrade,
  fetchTradeInbox,
  pingInbox,
  respondTrade,
  subscribeInboxChannel,
  type TradeInbox,
  type TradeInboxItem,
} from "../lib/trades";
import { listingPath, profilePath, tradePath } from "../lib/routes";
import {
  getTradeInboxSlot,
  getTradeInboxUiSnapshot,
  setTradeInboxUiBadge,
  setTradeInboxUiOpen,
  subscribeTradeInboxRefresh,
  subscribeTradeInboxSlot,
  subscribeTradeInboxUi,
} from "../lib/tradeInboxUi";
import { startVisiblePoll } from "../lib/visiblePoll";
import { CashAmount } from "./CurrencyChip";
import { ExchangeCompare } from "./ExchangeCompare";

const INBOX_IDLE_MS = 15_000;
const INBOX_OPEN_MS = 4_000;

const EMPTY_TRADES: TradeInbox = { incoming: [], outgoing: [], active: [] };
const EMPTY_OFFERS: MarketOfferInbox = { incoming: [], outgoing: [] };
const EMPTY_EXCHANGES: ExchangeInbox = { incoming: [], outgoing: [] };

function InboxIcon() {
  return (
    <svg
      className="trade-inbox__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6.5h16v11a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 17.5V6.5Z" />
      <path d="m4 6.5 8 5.25L20 6.5" />
    </svg>
  );
}

export function TradeInbox({
  className = "",
  variant = "header",
}: {
  className?: string;
  variant?: "header" | "mobile";
}) {
  const { user, refreshProfile } = useAuth();
  const { refresh: refreshCards } = useCardCollection();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const dismissedOnProfileRef = useRef(false);
  const [inboxReady, setInboxReady] = useState(false);
  const [inboxSlot, setInboxSlot] = useState<HTMLElement | null>(() =>
    getTradeInboxSlot(),
  );
  const [open, setOpen] = useState(() => getTradeInboxUiSnapshot().open);

  const setOpenSynced = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setOpen((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        setTradeInboxUiOpen(next);
        return next;
      });
    },
    [],
  );
  const [inbox, setInbox] = useState<TradeInbox>(EMPTY_TRADES);
  const [offers, setOffers] = useState<MarketOfferInbox>(EMPTY_OFFERS);
  const [exchanges, setExchanges] = useState<ExchangeInbox>(EMPTY_EXCHANGES);
  const [sales, setSales] = useState<MarketSaleNotice[]>([]);
  const [exchangePrice, setExchangePrice] = useState<Record<string, string>>(
    {},
  );
  /** Open compare sheet for an exchange (incoming or outgoing). */
  const [reviewExchange, setReviewExchange] = useState<{
    item: ExchangeInboxItem;
    role: "incoming" | "outgoing";
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const prevIncoming = useRef(0);
  const prevBadge = useRef(0);
  const prevOutgoingIds = useRef<Set<string>>(new Set());
  const hydrated = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (force = false) => {
    if (!user) {
      setInbox(EMPTY_TRADES);
      setOffers(EMPTY_OFFERS);
      setExchanges(EMPTY_EXCHANGES);
      setSales([]);
      return;
    }
    try {
      const [nextTrades, nextOffers, nextSales, nextExchanges] = await Promise.all([
        fetchTradeInbox({ force }),
        fetchMarketOfferInbox({ force }).catch(() => EMPTY_OFFERS),
        fetchMarketSaleNotices({ force }).catch(() => [] as MarketSaleNotice[]),
        fetchExchangeInbox({ force }).catch(() => EMPTY_EXCHANGES),
      ]);

      const nextOutgoingIds = new Set([
        ...nextOffers.outgoing.map((o) => `m:${o.id}`),
        ...nextExchanges.outgoing
          .filter((e) => e.status === "offered")
          .map((e) => `x:${e.id}`),
      ]);
      if (hydrated.current) {
        let resolvedOutgoing = false;
        for (const id of prevOutgoingIds.current) {
          if (!nextOutgoingIds.has(id)) {
            resolvedOutgoing = true;
            break;
          }
        }
        if (resolvedOutgoing) {
          // Seller / exchange partner accepted or declined - pull Cash + cards.
          await Promise.all([refreshCards(), refreshProfile()]);
          setNotice("An offer resolved. Cash and cards were refreshed.");
          setOpenSynced(true);
        }
      }
      prevOutgoingIds.current = nextOutgoingIds;

      setInbox(nextTrades);
      setOffers(nextOffers);
      setExchanges(nextExchanges);
      setSales(nextSales);
      setError(null);

      const nextBadge =
        nextTrades.incoming.length +
        nextTrades.active.length +
        nextTrades.outgoing.length +
        nextOffers.incoming.length +
        nextOffers.outgoing.length +
        nextExchanges.incoming.length +
        nextExchanges.outgoing.length +
        nextSales.length;

      const hot =
        nextTrades.incoming.length +
        nextTrades.active.length +
        nextOffers.incoming.length +
        nextExchanges.incoming.filter((e) => e.status === "pending").length +
        nextExchanges.outgoing.filter((e) => e.status === "offered").length +
        nextSales.length;

      if (!hydrated.current) {
        hydrated.current = true;
        prevIncoming.current = hot;
        prevBadge.current = nextBadge;
        setInboxReady(true);
        if (variant === "mobile") {
          if (nextBadge > 0) setOpenSynced(true);
        } else if (nextSales.length > 0 || nextBadge > 0) {
          setOpenSynced(true);
        }
      } else if (hot > prevIncoming.current) {
        dismissedOnProfileRef.current = false;
        setOpenSynced(true);
        if (nextSales.length > 0) {
          void Promise.all([refreshCards(), refreshProfile()]);
        }
      } else if (nextBadge > prevBadge.current) {
        dismissedOnProfileRef.current = false;
        setOpenSynced(true);
      } else if (
        variant === "mobile" &&
        pathnameRef.current === profilePath() &&
        !dismissedOnProfileRef.current &&
        nextBadge > 0
      ) {
        setOpenSynced(true);
      }
      prevIncoming.current = hot;
      prevBadge.current = nextBadge;
    } catch (err) {
      if (open) {
        setError(
          err instanceof Error ? err.message : "Could not load inbox.",
        );
      }
      if (!hydrated.current) {
        hydrated.current = true;
        setInboxReady(true);
      }
    }
  }, [user, refreshCards, refreshProfile, setOpenSynced, variant, open]);

  useEffect(() => {
    return subscribeTradeInboxUi(() => {
      const snap = getTradeInboxUiSnapshot();
      setOpen((prev) => (prev === snap.open ? prev : snap.open));
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeTradeInboxRefresh(() => {
      void refresh(true);
    });
  }, [user, refresh]);

  useLayoutEffect(() => {
    setInboxSlot(getTradeInboxSlot());
    return subscribeTradeInboxSlot(() => setInboxSlot(getTradeInboxSlot()));
  }, []);

  useLayoutEffect(() => {
    if (variant !== "mobile") return;
    if (pathname !== profilePath()) {
      dismissedOnProfileRef.current = false;
      return;
    }
    if (dismissedOnProfileRef.current) return;
    if (getTradeInboxUiSnapshot().badge > 0) setOpenSynced(true);
  }, [pathname, variant, setOpenSynced]);

  const closeMobileInbox = useCallback(() => {
    dismissedOnProfileRef.current = true;
    setOpenSynced(false);
  }, [setOpenSynced]);

  useEffect(() => {
    if (!user) {
      setInbox(EMPTY_TRADES);
      setOffers(EMPTY_OFFERS);
      setExchanges(EMPTY_EXCHANGES);
      setSales([]);
      prevIncoming.current = 0;
      prevOutgoingIds.current = new Set();
      hydrated.current = false;
      setInboxReady(false);
      setOpenSynced(false);
      setNotice(null);
      setTradeInboxUiBadge(0, false);
      return;
    }
    void refresh(open);
    const stopPoll = startVisiblePoll(
      () => void refresh(),
      open ? INBOX_OPEN_MS : INBOX_IDLE_MS,
    );
    const unsub = subscribeInboxChannel(user.id, () => {
      void refresh(true);
    });
    return () => {
      stopPoll();
      unsub();
    };
  }, [user, refresh, open]);

  useEffect(() => {
    if (!open || variant === "mobile") return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-inbox-trigger]")
      ) {
        return;
      }
      setOpenSynced(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSynced(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpenSynced, variant]);

  const badge = user
    ? inbox.incoming.length +
      inbox.active.length +
      inbox.outgoing.length +
      offers.incoming.length +
      offers.outgoing.length +
      exchanges.incoming.length +
      exchanges.outgoing.length +
      sales.length
    : 0;
  const isHot =
    inbox.incoming.length +
      offers.incoming.length +
      exchanges.incoming.filter((e) => e.status === "pending").length +
      exchanges.outgoing.filter((e) => e.status === "offered").length +
      sales.length >
    0;

  useEffect(() => {
    if (!user) {
      setTradeInboxUiBadge(0, false);
      return;
    }
    if (!inboxReady) return;
    setTradeInboxUiBadge(badge, isHot);
  }, [badge, isHot, user, inboxReady]);

  if (!user) return null;

  const onProfile = pathname === profilePath();
  if (variant === "mobile" && (!open || !onProfile || !inboxSlot)) {
    return null;
  }

  async function onAcceptTrade(item: TradeInboxItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await respondTrade(item.id, true);
      await pingInbox(item.partnerId).catch(() => undefined);
      setOpenSynced(false);
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

  function exchangeFee(item: ExchangeInboxItem): number {
    const raw = exchangePrice[item.id];
    if (raw == null || raw.trim() === "") return 0;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(1_000_000, n);
  }

  async function onOfferExchange(item: ExchangeInboxItem, price: number) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await respondExchange(item.id, true, price);
      await pingInbox(item.partnerId).catch(() => undefined);
      setNotice(
        price > 0
          ? `Asked ${item.partnerUsername} for ${price.toLocaleString()} Cash. Waiting for them to accept.`
          : `Offered a free swap. Waiting for ${item.partnerUsername} to accept.`,
      );
      setReviewExchange(null);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send offer.");
    }
    setBusyId(null);
  }

  async function onConfirmExchange(item: ExchangeInboxItem, accept: boolean) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const result = await confirmExchange(item.id, accept);
      await pingInbox(item.partnerId).catch(() => undefined);
      if (result === "completed") {
        await Promise.all([refreshCards(), refreshProfile()]);
        void import("../lib/accountStats").then((m) => {
          void m.recordExchangeCompleted();
        });
        setNotice(
          item.price > 0
            ? `Exchanged ${offerCardLabel(item.cardId)} for ${item.price.toLocaleString()} Cash.`
            : `Exchanged ${offerCardLabel(item.cardId)} for free.`,
        );
      }
      setReviewExchange(null);
      await refresh(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not respond to exchange.",
      );
    }
    setBusyId(null);
  }

  async function onDeclineExchange(item: ExchangeInboxItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await respondExchange(item.id, false, 0);
      await pingInbox(item.partnerId).catch(() => undefined);
      setReviewExchange(null);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline exchange.");
    }
    setBusyId(null);
  }

  async function onCancelExchange(item: ExchangeInboxItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await cancelExchange(item.id);
      await pingInbox(item.partnerId).catch(() => undefined);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel exchange.");
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
    setNotice(null);
    try {
      await respondListingOffer(offer.id, true);
      await notifyMarketPartner(offer.partnerId);
      await Promise.all([refreshCards(), refreshProfile()]);
      setNotice(
        `Accepted offer, Cash received, card sent to ${offer.partnerUsername}.`,
      );
      setOpenSynced(false);
      navigate(listingPath(offer.listingId));
      await refresh(true);
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

  async function onAckSale(notice: MarketSaleNotice) {
    setBusyId(notice.id);
    setError(null);
    try {
      await ackMarketSaleNotices([notice.id]);
      setSales((prev) => prev.filter((s) => s.id !== notice.id));
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss sale.");
    }
    setBusyId(null);
  }

  function offerCardLabel(cardId: string): string {
    return cardSpecById(cardId)?.entity.name ?? "Card";
  }

  function InboxThumb({ cardId }: { cardId: string }) {
    const card = cardSpecById(cardId);
    if (!card) return null;
    return (
      <img
        className="trade-inbox__thumb"
        src={card.entity.image}
        alt=""
        width={40}
        height={40}
        style={{ ["--card-shell" as string]: categoryShell(card.entity.category) }}
      />
    );
  }


  const tree = (
    <div
      className={[
        "trade-inbox",
        variant === "mobile" ? "trade-inbox--mobile" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      ref={wrapRef}
    >
      {variant === "header" ? (
      <button
        type="button"
        className={`trade-inbox__trigger${open ? " is-open" : ""}`}
        aria-label={
          badge > 0
            ? `${badge} notification${badge === 1 ? "" : "s"}`
            : "Inbox"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpenSynced((v) => !v)}
      >
        <InboxIcon />
        {badge > 0 ? (
          <span
            className={`trade-inbox__badge${isHot ? " is-hot" : ""}`}
            aria-hidden
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>
      ) : null}

      {open ? (
        <div
          className={`trade-inbox__panel${variant === "mobile" ? " trade-inbox__panel--mobile-top" : ""}`}
          role={variant === "mobile" ? "region" : "dialog"}
          aria-label="Inbox"
        >
          {variant === "mobile" ? (
            <div className="trade-inbox__mobile-head">
              <p className="trade-inbox__title">Inbox</p>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                aria-label="Close"
                onClick={closeMobileInbox}
              >
                ✕
              </button>
            </div>
          ) : (
            <p className="trade-inbox__title">Inbox</p>
          )}
          {error ? <p className="trade-inbox__err">{error}</p> : null}
          {notice ? <p className="trade-inbox__notice">{notice}</p> : null}

          {badge === 0 ? (
            <p className="trade-inbox__empty">Nothing waiting right now.</p>
          ) : null}

          {sales.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Sold</h3>
              <ul>
                {sales.map((item) => {
                  return (
                    <li key={item.id}>
                      <div className="trade-inbox__row trade-inbox__row--offer">
                        <InboxThumb cardId={item.cardId} />
                        <span>
                          <strong>{offerCardLabel(item.cardId)}</strong> sold
                          {item.buyerUsername ? (
                            <>
                              {" "}
                              to <strong>{item.buyerUsername}</strong>
                            </>
                          ) : null}{" "}
                          for <CashAmount amount={item.price} size={15} />
                        </span>
                        <div className="trade-inbox__actions">
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={busyId === item.id}
                            onClick={() => void onAckSale(item)}
                          >
                            Got it
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {offers.incoming.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Market offers</h3>
              <ul>
                {offers.incoming.map((item) => {
                  return (
                    <li key={item.id}>
                      <div className="trade-inbox__row trade-inbox__row--offer">
                        <InboxThumb cardId={item.cardId} />
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
                              setOpenSynced(false);
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
                            setOpenSynced(false);
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

          {exchanges.incoming.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Exchange requests</h3>
              <ul>
                {exchanges.incoming.map((item) => {
                  const offered = item.status === "offered";
                  return (
                    <li key={item.id}>
                      <div className="trade-inbox__row trade-inbox__row--offer">
                        <InboxThumb cardId={item.cardId} />
                        <span>
                          {offered ? (
                            <>
                              Waiting on <strong>{item.partnerUsername}</strong>{" "}
                              for {offerCardLabel(item.cardId)}
                              {item.price > 0 ? (
                                <>
                                  {" "}
                                  · <CashAmount amount={item.price} size={15} />
                                </>
                              ) : (
                                " · free"
                              )}
                            </>
                          ) : (
                            <>
                              <strong>{item.partnerUsername}</strong> wants to
                              exchange {offerCardLabel(item.cardId)}
                            </>
                          )}
                        </span>
                        <div className="trade-inbox__actions">
                          {offered ? (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busyId === item.id}
                              onClick={() => void onCancelExchange(item)}
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              onClick={() =>
                                setReviewExchange({ item, role: "incoming" })
                              }
                            >
                              Review
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {exchanges.outgoing.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Sent exchanges</h3>
              <ul>
                {exchanges.outgoing.map((item) => {
                  const offered = item.status === "offered";
                  return (
                    <li key={item.id}>
                      <div className="trade-inbox__row trade-inbox__row--offer">
                        <InboxThumb cardId={item.cardId} />
                        <span>
                          {offered ? (
                            <>
                              <strong>{item.partnerUsername}</strong> offered{" "}
                              {item.price > 0 ? (
                                <CashAmount amount={item.price} size={15} />
                              ) : (
                                "a free swap"
                              )}{" "}
                              for {offerCardLabel(item.cardId)}
                            </>
                          ) : (
                            <>
                              {offerCardLabel(item.cardId)} · waiting on{" "}
                              <strong>{item.partnerUsername}</strong>
                            </>
                          )}
                        </span>
                        <div className="trade-inbox__actions">
                          {offered ? (
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              onClick={() =>
                                setReviewExchange({ item, role: "outgoing" })
                              }
                            >
                              Review
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busyId === item.id}
                              onClick={() => void onCancelExchange(item)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
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
                            setOpenSynced(false);
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

      {reviewExchange
        ? createPortal(
            <div
              className="exchange-review"
              role="dialog"
              aria-modal="true"
              aria-label="Review exchange"
            >
              <button
                type="button"
                className="exchange-review__backdrop"
                aria-label="Close"
                onClick={() => setReviewExchange(null)}
              />
              <div className="exchange-review__panel">
                <header className="exchange-review__head">
                  <div>
                    <p className="eyebrow">Exchange</p>
                    <h2>
                      {reviewExchange.role === "incoming"
                        ? `Offer from ${reviewExchange.item.partnerUsername}`
                        : `Offer from ${reviewExchange.item.partnerUsername}`}
                    </h2>
                    <p>
                      {reviewExchange.role === "incoming"
                        ? "Compare copies, then set what they pay you to swap (or offer free)."
                        : reviewExchange.item.price > 0
                          ? `They want ${reviewExchange.item.price.toLocaleString()} Cash to swap.`
                          : "They offered a free swap."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    aria-label="Close"
                    onClick={() => setReviewExchange(null)}
                  >
                    ✕
                  </button>
                </header>

                <ExchangeCompare
                  cardId={reviewExchange.item.cardId}
                  mine={{
                    label: "You",
                    seed: reviewExchange.item.mySeed,
                    degree: reviewExchange.item.myDegree,
                  }}
                  theirs={{
                    label: reviewExchange.item.partnerUsername,
                    seed: reviewExchange.item.theirSeed,
                    degree: reviewExchange.item.theirDegree,
                  }}
                />

                {reviewExchange.role === "incoming" &&
                reviewExchange.item.status === "pending" ? (
                  <>
                    <p className="exchange-review__fee-note">
                      Cash fee is what you charge them to swap copies.
                    </p>
                    <div className="exchange-review__actions">
                      <label className="trade-inbox__price exchange-review__price">
                        Cash fee
                        <input
                          type="number"
                          min={0}
                          max={1000000}
                          inputMode="numeric"
                          value={
                            exchangePrice[reviewExchange.item.id] ?? "0"
                          }
                          onChange={(e) =>
                            setExchangePrice((prev) => ({
                              ...prev,
                              [reviewExchange.item.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={busyId === reviewExchange.item.id}
                        onClick={() =>
                          void onOfferExchange(reviewExchange.item, 0)
                        }
                      >
                        Offer free
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={busyId === reviewExchange.item.id}
                        onClick={() =>
                          void onOfferExchange(
                            reviewExchange.item,
                            exchangeFee(reviewExchange.item),
                          )
                        }
                      >
                        Send offer
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={busyId === reviewExchange.item.id}
                        onClick={() =>
                          void onDeclineExchange(reviewExchange.item)
                        }
                      >
                        Decline
                      </button>
                    </div>
                  </>
                ) : null}

                {reviewExchange.role === "outgoing" &&
                reviewExchange.item.status === "offered" ? (
                  <div className="exchange-review__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busyId === reviewExchange.item.id}
                      onClick={() =>
                        void onConfirmExchange(reviewExchange.item, true)
                      }
                    >
                      Accept swap
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busyId === reviewExchange.item.id}
                      onClick={() =>
                        void onConfirmExchange(reviewExchange.item, false)
                      }
                    >
                      Decline
                    </button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
  if (variant === "mobile" && inboxSlot) {
    return createPortal(tree, inboxSlot);
  }
  return tree;
}
