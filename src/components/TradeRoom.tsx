import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { fetchPlayerCardIds } from "../lib/awardCards";
import { fetchPlayerParagons } from "../lib/paragonApi";
import type { ParagonMap } from "../lib/guestParagons";
import { cardSpecById } from "../lib/cardCatalog";
import {
  cancelTrade,
  fetchTrade,
  pingTrade,
  setTradeOffer,
  setTradeReady,
  subscribeTradeChannel,
  type TradeState,
} from "../lib/trades";
import { collectionPath, marketplacePath } from "../lib/routes";
import { PageHeader } from "./PageHeader";
import { MonkeyCard } from "./MonkeyCard";
import { OwnedCardPicker } from "./OwnedCardPicker";

export function TradeRoom() {
  const { tradeId = "" } = useParams();
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const { owned, refresh: refreshCards } = useCardCollection();
  const [trade, setTrade] = useState<TradeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localOffer, setLocalOffer] = useState<string[]>([]);
  const [partnerOwned, setPartnerOwned] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [partnerParagons, setPartnerParagons] = useState<ParagonMap>({});
  const strippingRef = useRef(false);

  const load = useCallback(async () => {
    if (!tradeId || !user) return;
    try {
      const next = await fetchTrade(tradeId);
      setTrade((prev) => {
        if (next.status !== "completed") return next;
        return {
          ...next,
          myOffer: next.myOffer.length ? next.myOffer : (prev?.myOffer ?? []),
          theirOffer: next.theirOffer.length
            ? next.theirOffer
            : (prev?.theirOffer ?? []),
        };
      });
      setLocalOffer((prev) => {
        const incoming =
          next.status === "completed" && !next.myOffer.length
            ? prev
            : next.myOffer;
        if (
          prev.length === incoming.length &&
          prev.every((id, i) => id === incoming[i])
        ) {
          return prev;
        }
        const prevSet = new Set(prev);
        const nextSet = new Set(incoming);
        if (
          prevSet.size === nextSet.size &&
          [...prevSet].every((id) => nextSet.has(id))
        ) {
          return prev;
        }
        return incoming;
      });
      setError(null);
      if (next.status === "completed") {
        setStatus((prev) => prev ?? "Trade completed");
        void refreshCards();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trade.");
    }
    setLoading(false);
  }, [tradeId, user, refreshCards]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!tradeId || !user) return;
    if (trade?.status === "completed" || trade?.status === "cancelled") return;
    const poll = window.setInterval(() => void load(), 1500);
    const unsub = subscribeTradeChannel(tradeId, () => {
      void load();
    });
    return () => {
      window.clearInterval(poll);
      unsub();
    };
  }, [tradeId, user, load, trade?.status]);

  const partnerId = useMemo(() => {
    if (!trade || !user) return null;
    return trade.requesterId === user.id
      ? trade.recipientId
      : trade.requesterId;
  }, [trade, user]);

  useEffect(() => {
    if (!partnerId) {
      setPartnerOwned(new Set());
      setPartnerParagons({});
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchPlayerCardIds(partnerId),
      fetchPlayerParagons(partnerId),
    ])
      .then(([ids, nextParagons]) => {
        if (cancelled) return;
        setPartnerOwned(new Set(ids));
        setPartnerParagons(nextParagons);
      })
      .catch(() => {
        if (cancelled) return;
        setPartnerOwned(new Set());
        setPartnerParagons({});
      });
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  const partnerName = useMemo(() => {
    if (!trade || !user) return "Partner";
    return trade.requesterId === user.id
      ? trade.recipientUsername
      : trade.requesterUsername;
  }, [trade, user]);

  const iAmReady = useMemo(() => {
    if (!trade || !user) return false;
    return trade.requesterId === user.id
      ? trade.requesterReady
      : trade.recipientReady;
  }, [trade, user]);

  const theyReady = useMemo(() => {
    if (!trade || !user) return false;
    return trade.requesterId === user.id
      ? trade.recipientReady
      : trade.requesterReady;
  }, [trade, user]);

  const offerSet = useMemo(() => new Set(localOffer), [localOffer]);

  /** Partner already keeps these (not offering them away). */
  const unavailableIds = useMemo(() => {
    const theirOffer = new Set(trade?.theirOffer ?? []);
    const blocked = new Set<string>();
    for (const id of partnerOwned) {
      if (!theirOffer.has(id)) blocked.add(id);
    }
    return blocked;
  }, [partnerOwned, trade?.theirOffer]);

  const syncOffer = useCallback(
    async (next: string[]) => {
      if (!tradeId) return;
      setBusy(true);
      setError(null);
      setStatus(null);
      try {
        await setTradeOffer(tradeId, next);
        setLocalOffer(next);
        await pingTrade(tradeId);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update offer.");
        await load();
      }
      setBusy(false);
    },
    [tradeId, load],
  );

  // Drop offer cards that became invalid if partner stopped offering a duplicate.
  useEffect(() => {
    if (!trade || trade.status !== "active" || busy || strippingRef.current) {
      return;
    }
    if (unavailableIds.size === 0) return;
    const cleaned = localOffer.filter((id) => !unavailableIds.has(id));
    if (cleaned.length === localOffer.length) return;
    strippingRef.current = true;
    void syncOffer(cleaned).finally(() => {
      strippingRef.current = false;
    });
  }, [unavailableIds, trade, busy, localOffer, syncOffer]);

  function toggleCard(cardId: string) {
    if (busy || trade?.status !== "active") return;
    if (!offerSet.has(cardId) && unavailableIds.has(cardId)) {
      setError("They already own that card.");
      return;
    }
    const has = offerSet.has(cardId);
    if (!has && localOffer.length >= 8) {
      setError("Max 8 cards on your side.");
      return;
    }
    const next = has
      ? localOffer.filter((id) => id !== cardId)
      : [...localOffer, cardId];
    void syncOffer(next);
  }

  async function onReady(ready: boolean) {
    if (!tradeId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const next = await setTradeReady(tradeId, ready);
      setTrade((prev) => {
        if (next.status !== "completed") return next;
        return {
          ...next,
          myOffer: next.myOffer.length ? next.myOffer : (prev?.myOffer ?? localOffer),
          theirOffer: next.theirOffer.length
            ? next.theirOffer
            : (prev?.theirOffer ?? []),
        };
      });
      setLocalOffer((prev) =>
        next.status === "completed" && !next.myOffer.length ? prev : next.myOffer,
      );
      await pingTrade(tradeId);
      if (next.status === "completed") {
        setStatus("Trade completed");
        void refreshCards();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update ready.");
      await load();
    }
    setBusy(false);
  }

  async function onCancel() {
    if (!tradeId) return;
    setBusy(true);
    try {
      await cancelTrade(tradeId);
      await pingTrade(tradeId);
      navigate(collectionPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    }
    setBusy(false);
  }

  if (isGuest || !user) {
    return (
      <div className="trade-page">
        <PageHeader title="Trade" blurb="Sign in to trade cards with other players." />
        <main className="trade-main">
          <p className="trade-banner trade-banner--err">
            Sign in to trade cards.{" "}
            <Link to={marketplacePath()}>Marketplace</Link>
          </p>
        </main>
      </div>
    );
  }

  if (loading && !trade) {
    return (
      <div className="trade-page">
        <PageHeader title="Trade" blurb="Loading…" />
        <main className="trade-main">
          <p className="trade-empty">Loading trade…</p>
        </main>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="trade-page">
        <PageHeader title="Trade" />
        <main className="trade-main">
          <p className="trade-banner trade-banner--err">
            {error ?? "Trade not found."}
          </p>
        </main>
      </div>
    );
  }

  const done = trade.status === "completed";
  const active = trade.status === "active";

  return (
    <div className="trade-page">
      <PageHeader
        eyebrow="Live trade"
        title={`With ${partnerName}`}
        blurb={
          done
            ? "Trade completed. These are the cards that swapped."
            : active
              ? "Pick cards below, then Ready when the offers look good."
              : `This trade is ${trade.status}.`
        }
      />
      <main className="trade-main">
        {error ? (
          <p className="trade-banner trade-banner--err">{error}</p>
        ) : null}
        {done ? (
          <p className="trade-banner trade-banner--ok" role="status">
            Trade completed
          </p>
        ) : status ? (
          <p className="trade-banner trade-banner--ok">{status}</p>
        ) : null}

        <div className="trade-summary">
          <div className="trade-sides">
            <section className="trade-side">
              <header className="trade-side__head">
                <h2>You · {localOffer.length}/8</h2>
                <span className={done || iAmReady ? "is-ready" : ""}>
                  {done ? "Completed" : iAmReady ? "Ready" : "Not ready"}
                </span>
              </header>
              <div className="trade-offer-grid">
                {localOffer.length === 0 ? (
                  <p className="trade-empty">Nothing offered yet</p>
                ) : (
                  localOffer.map((id) => {
                    const card = cardSpecById(id);
                    if (!card) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="trade-offer-card"
                        disabled={!active || busy}
                        title="Remove from offer"
                        onClick={() => toggleCard(id)}
                      >
                        <MonkeyCard
                          entity={card.entity}
                          pathLevels={card.pathLevels}
                          mode="preview"
                          owned
                          staticArt
                        />
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="trade-side">
              <header className="trade-side__head">
                <h2>
                  {partnerName} · {trade.theirOffer.length}/8
                </h2>
                <span className={done || theyReady ? "is-ready" : ""}>
                  {done ? "Completed" : theyReady ? "Ready" : "Not ready"}
                </span>
              </header>
              <div className="trade-offer-grid">
                {trade.theirOffer.length === 0 ? (
                  <p className="trade-empty">Waiting for their cards…</p>
                ) : (
                  trade.theirOffer.map((id) => {
                    const card = cardSpecById(id);
                    if (!card) return null;
                    return (
                      <div key={id} className="trade-offer-card is-locked">
                        <MonkeyCard
                          entity={card.entity}
                          pathLevels={card.pathLevels}
                          mode="preview"
                          owned
                          staticArt
                          degree={
                            card.isParagon
                              ? (partnerParagons[id]?.degree ?? 1)
                              : undefined
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {active ? (
            <div className="trade-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void onReady(!iAmReady)}
              >
                {iAmReady ? "Unready" : "Ready to trade"}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => void onCancel()}
              >
                Cancel trade
              </button>
            </div>
          ) : null}
        </div>

        {active ? (
          <section className="trade-picker">
            <OwnedCardPicker
              owned={owned}
              selectedIds={offerSet}
              unavailableIds={unavailableIds}
              unavailableLabel="They own this"
              disabled={busy}
              maxSelected={8}
              confirmLabel={busy ? "Updating…" : "Add to trade"}
              onConfirm={(ids) => {
                if (ids.length > 8) {
                  setError("Max 8 cards on your side.");
                  return;
                }
                void syncOffer(ids);
              }}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
