import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
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
import { CardChip } from "./CardChip";
import { GameHeader } from "./GameHeader";
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
              ? "Add cards below. Both players Ready to finish."
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
              <h2>You · {localOffer.length}/8</h2>
              <span className={iAmReady ? "is-ready" : ""}>
                {iAmReady ? "Ready" : "Not ready"}
              </span>
            </header>
            <div className="trade-chip-list">
              {localOffer.length === 0 ? (
                <p className="trade-empty">Nothing offered yet</p>
              ) : (
                localOffer.map((id) => (
                  <CardChip
                    key={id}
                    cardId={id}
                    selected
                    disabled={!active || busy}
                    actionLabel={active ? "Remove" : undefined}
                    onClick={active ? () => toggleCard(id) : undefined}
                  />
                ))
              )}
            </div>
          </section>

          <section className="trade-side">
            <header className="trade-side__head">
              <h2>
                {partnerName} · {trade.theirOffer.length}/8
              </h2>
              <span className={theyReady ? "is-ready" : ""}>
                {theyReady ? "Ready" : "Not ready"}
              </span>
            </header>
            <div className="trade-chip-list">
              {trade.theirOffer.length === 0 ? (
                <p className="trade-empty">Waiting for their cards…</p>
              ) : (
                trade.theirOffer.map((id) => (
                  <CardChip key={id} cardId={id} locked />
                ))
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
            <h3>Add from your collection</h3>
            <OwnedCardPicker
              owned={owned}
              selectedIds={offerSet}
              disabled={busy}
              maxSelected={8}
              onMaxReached={() => setError("Max 8 cards on your side.")}
              onToggle={toggleCard}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
