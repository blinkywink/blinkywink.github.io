import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import {
  allCardSpecs,
  cardSpecById,
  matchesCardQuery,
} from "../lib/cardCatalog";
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
import { GameHeader } from "./GameHeader";
import { MonkeyCard } from "./MonkeyCard";

export function TradeRoom() {
  const { tradeId = "" } = useParams();
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const { owned, refresh: refreshCards } = useCardCollection();
  const [trade, setTrade] = useState<TradeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [localOffer, setLocalOffer] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!tradeId || !user) return;
    try {
      const next = await fetchTrade(tradeId);
      setTrade(next);
      setLocalOffer(next.myOffer);
      setError(null);
      if (next.status === "completed") {
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
    const poll = window.setInterval(() => void load(), 1500);
    const unsub = subscribeTradeChannel(tradeId, () => {
      void load();
    });
    return () => {
      window.clearInterval(poll);
      unsub();
    };
  }, [tradeId, user, load]);

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

  const searchable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCardSpecs().filter(
      (c) => owned.has(c.id) && matchesCardQuery(c, q),
    );
  }, [owned, query]);

  async function syncOffer(next: string[]) {
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
  }

  function toggleCard(cardId: string) {
    if (busy || trade?.status !== "active") return;
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
      setTrade(next);
      setLocalOffer(next.myOffer);
      await pingTrade(tradeId);
      if (next.status === "completed") {
        setStatus("Trade complete — cards swapped!");
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
        <GameHeader title="TRADE" icon="" />
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
        <GameHeader title="TRADE" icon="" />
        <main className="trade-main">
          <p className="trade-empty">Loading trade…</p>
        </main>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="trade-page">
        <GameHeader title="TRADE" icon="" />
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
      <GameHeader title={`TRADE · ${partnerName}`} icon="" />
      <main className="trade-main">
        <p className="trade-sub">
          {done
            ? "Trade finished. Cards are in both collections."
            : active
              ? "Add cards from your collection. Both players must press Ready to swap."
              : `This trade is ${trade.status}.`}
        </p>

        {error ? (
          <p className="trade-banner trade-banner--err">{error}</p>
        ) : null}
        {status ? (
          <p className="trade-banner trade-banner--ok">{status}</p>
        ) : null}

        <div className="trade-sides">
          <section className="trade-side">
            <header className="trade-side__head">
              <h2>You offer</h2>
              <span className={iAmReady ? "is-ready" : ""}>
                {iAmReady ? "Ready" : "Not ready"}
              </span>
            </header>
            <div className="trade-offer-grid">
              {localOffer.length === 0 ? (
                <p className="trade-empty">No cards yet</p>
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
                      onClick={() => toggleCard(id)}
                      title="Remove from offer"
                    >
                      <MonkeyCard
                        entity={card.entity}
                        pathLevels={card.pathLevels}
                        mode="preview"
                        owned
                      />
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="trade-side">
            <header className="trade-side__head">
              <h2>{partnerName} offers</h2>
              <span className={theyReady ? "is-ready" : ""}>
                {theyReady ? "Ready" : "Not ready"}
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

        {active ? (
          <section className="trade-picker">
            <h3>Your cards</h3>
            <label className="trade-search">
              <span className="trade-search__label">Search</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tower, path, name…"
                autoComplete="off"
              />
            </label>
            <div className="trade-pick-grid">
              {searchable.length === 0 ? (
                <p className="trade-empty">No matching owned cards.</p>
              ) : (
                searchable.slice(0, 60).map((card) => {
                  const selected = offerSet.has(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`trade-pick${selected ? " is-selected" : ""}`}
                      disabled={busy}
                      onClick={() => toggleCard(card.id)}
                    >
                      <MonkeyCard
                        entity={card.entity}
                        pathLevels={card.pathLevels}
                        mode="preview"
                        owned
                      />
                    </button>
                  );
                })
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
