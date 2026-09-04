import { useEffect, useState } from "react";
import type { MonkeyCardSpec } from "../lib/pathCombos";
import { formatPathLevels, maxPathTier } from "../lib/pathCombos";
import { fetchCardCirculation } from "../lib/awardCards";
import { needsVisualSeed } from "../lib/cardVisualSeed";
import { MonkeyCard } from "./MonkeyCard";

type Props = {
  card: MonkeyCardSpec;
  visualSeed: number | null;
  degree?: number;
  canScrap: boolean;
  onClose: () => void;
  onScrap: () => Promise<void>;
};

export function CardInfoSheet({
  card,
  visualSeed,
  degree,
  canScrap,
  onClose,
  onScrap,
}: Props) {
  const [copies, setCopies] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scrapError, setScrapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCopies(null);
    setLoadError(null);
    void fetchCardCirculation(card.id)
      .then((n) => {
        if (!cancelled) setCopies(Math.max(1, n));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Could not load circulation.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  const tier = card.isParagon ? null : maxPathTier(card.pathLevels);
  const seedOn = needsVisualSeed(card.id) && visualSeed != null;
  const total = copies ?? 1;

  async function confirmScrap() {
    if (busy) return;
    setBusy(true);
    setScrapError(null);
    try {
      await onScrap();
    } catch (err) {
      setScrapError(
        err instanceof Error ? err.message : "Could not scrap this card.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="card-info" role="dialog" aria-modal="true" aria-label="Card info">
      <button
        type="button"
        className="card-info__backdrop"
        aria-label="Close card info"
        onClick={onClose}
      />
      <div className="card-info__panel">
        <button
          type="button"
          className="btn btn--ghost btn--sm card-info__close"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
        <div className="card-info__face">
          <MonkeyCard
            entity={card.entity}
            pathLevels={card.pathLevels}
            mode="focus"
            owned
            degree={degree}
            visualSeed={visualSeed}
          />
        </div>
        <div className="card-info__copy">
          <p className="eyebrow">Card info</p>
          <h2>{card.entity.name}</h2>
          <p className="card-info__meta">
            {card.isParagon
              ? `Paragon · ${card.tower}`
              : `${formatPathLevels(card.pathLevels)} · ${card.tower} · T${tier}`}
            {card.isParagon && degree != null ? ` · Degree ${degree}` : ""}
          </p>
          <p className="card-info__stat">
            {loadError ? (
              loadError
            ) : copies == null ? (
              "Counting copies…"
            ) : (
              <>
                <strong>
                  1/{total.toLocaleString("en-US")}
                </strong>{" "}
                in circulation
              </>
            )}
          </p>
          {seedOn ? (
            <p className="card-info__stat">
              Art seed <strong>#{visualSeed}</strong>
            </p>
          ) : null}
          {scrapError ? (
            <p className="card-info__error">{scrapError}</p>
          ) : null}
        </div>
        {canScrap ? (
          confirming ? (
            <div className="card-info__confirm">
              <p>Scrap this card? It’s gone for good. No Cash.</p>
              <div className="card-info__confirm-row">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--sm card-info__scrap-go"
                  disabled={busy}
                  onClick={() => void confirmScrap()}
                >
                  {busy ? "Scrapping…" : "Scrap it"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="card-info__trash"
              aria-label="Scrap card"
              title="Scrap card"
              onClick={() => {
                setScrapError(null);
                setConfirming(true);
              }}
            >
              <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 7h16" />
              <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" />
              <path d="M18.2 7l-.7 12.2A2 2 0 0 1 15.5 21h-7a2 2 0 0 1-2-1.8L5.8 7" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
