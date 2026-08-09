import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  cancelTrade,
  fetchTradeInbox,
  pingInbox,
  respondTrade,
  subscribeInboxChannel,
  type TradeInbox,
  type TradeInboxItem,
} from "../lib/trades";
import { tradePath } from "../lib/routes";

const EMPTY: TradeInbox = { incoming: [], outgoing: [], active: [] };

export function TradeInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<TradeInbox>(EMPTY);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevIncoming = useRef(0);
  const prevActive = useRef(0);
  const hydrated = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setInbox(EMPTY);
      return;
    }
    try {
      const next = await fetchTradeInbox();
      setInbox(next);
      setError(null);
      if (!hydrated.current) {
        hydrated.current = true;
        prevIncoming.current = next.incoming.length;
        prevActive.current = next.active.length;
      } else if (
        next.incoming.length > prevIncoming.current ||
        next.active.length > prevActive.current
      ) {
        setOpen(true);
      }
      prevIncoming.current = next.incoming.length;
      prevActive.current = next.active.length;
    } catch {
      // Quiet — header shouldn't spam errors while offline
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setInbox(EMPTY);
      prevIncoming.current = 0;
      prevActive.current = 0;
      hydrated.current = false;
      setOpen(false);
      return;
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), 2500);
    const unsub = subscribeInboxChannel(user.id, () => {
      void refresh();
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
    inbox.incoming.length + inbox.active.length + inbox.outgoing.length;
  const highlight = inbox.incoming.length > 0;

  async function onAccept(item: TradeInboxItem) {
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

  async function onDecline(item: TradeInboxItem) {
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

  async function onCancel(item: TradeInboxItem) {
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

  return (
    <div className="trade-inbox" ref={wrapRef}>
      <button
        type="button"
        className={`trade-inbox__btn${highlight ? " is-hot" : ""}`}
        aria-label="Trade notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M15 17H9a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5h.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M9 7h6a5 5 0 0 1 5 5v3a5 5 0 0 1-5 5H14.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M13 3l3 3-3 3M11 15l-3 3 3 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {badge > 0 ? (
          <span className="trade-inbox__badge">{badge > 9 ? "9+" : badge}</span>
        ) : null}
      </button>

      {open ? (
        <div className="trade-inbox__panel" role="dialog" aria-label="Trades">
          <p className="trade-inbox__title">Trades</p>
          {error ? <p className="trade-inbox__err">{error}</p> : null}

          {inbox.incoming.length === 0 &&
          inbox.outgoing.length === 0 &&
          inbox.active.length === 0 ? (
            <p className="trade-inbox__empty">No trade activity right now.</p>
          ) : null}

          {inbox.incoming.length > 0 ? (
            <section className="trade-inbox__section">
              <h3>Requests</h3>
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
                          onClick={() => void onAccept(item)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busyId === item.id}
                          onClick={() => void onDecline(item)}
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
                          onClick={() => void onCancel(item)}
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
              <h3>Sent</h3>
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
                          onClick={() => void onCancel(item)}
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
