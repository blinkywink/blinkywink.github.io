import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { AvatarCrop } from "../lib/avatar";
import { MAX_MARKET_PRICE } from "../lib/marketplace";
import type { MonkeyCardSpec } from "../lib/pathCombos";
import { MonkeyCard } from "./MonkeyCard";
import { UserAvatar } from "./UserAvatar";

const MIN_OFFER = 10;

type Props = {
  card: MonkeyCardSpec;
  visualSeed: number | null;
  degree: number | null;
  ownerName: string;
  ownerAvatar: AvatarCrop | null;
  balance: number | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (price: number) => void;
};

function digitsOnly(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (!digits) return "";
  const n = Math.min(MAX_MARKET_PRICE, Number(digits));
  return String(n);
}

export function CollectionOfferSheet({
  card,
  visualSeed,
  degree,
  ownerName,
  ownerAvatar,
  balance,
  busy,
  error,
  onClose,
  onSubmit,
}: Props) {
  const fieldId = useId();
  const [amount, setAmount] = useState("");
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (full) setFull(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, onClose]);

  const price = amount ? Number(amount) : NaN;
  const tooLow = Number.isFinite(price) && price < MIN_OFFER;
  const overBalance =
    balance != null && Number.isFinite(price) && price > balance;
  const canSend =
    !busy &&
    Number.isFinite(price) &&
    price >= MIN_OFFER &&
    price <= MAX_MARKET_PRICE &&
    !overBalance;

  return (
    <div className="offer-sheet" role="dialog" aria-modal="true" aria-label="Make an offer">
      <button
        type="button"
        className="offer-sheet__backdrop"
        aria-label="Close offer"
        onClick={onClose}
      />
      <form
        className="offer-sheet__panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          onSubmit(price);
        }}
      >
        <button
          type="button"
          className="btn btn--ghost btn--sm offer-sheet__close"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="offer-sheet__who">
          <button
            type="button"
            className="offer-thumb"
            aria-label={`View ${card.entity.name}`}
            onClick={() => setFull(true)}
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
          <span className="offer-owner">
            <UserAvatar crop={ownerAvatar} size={28} alt="" />
            <span>{ownerName}</span>
          </span>
        </div>

        <label className="offer-sheet__field" htmlFor={fieldId}>
          <span className="visually-hidden">Offer amount</span>
          <span className="offer-sheet__input">
            <img src="/images/ui/money-icon.webp" alt="" width={22} height={22} />
            <input
              id={fieldId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(digitsOnly(e.target.value))}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text");
                setAmount(digitsOnly(amount + text));
              }}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
              }}
            />
          </span>
        </label>

        {tooLow ? (
          <p className="offer-sheet__err">At least 10 Cash.</p>
        ) : overBalance ? (
          <p className="offer-sheet__err">Not enough Cash.</p>
        ) : error ? (
          <p className="offer-sheet__err">{error}</p>
        ) : null}

        <div className="offer-sheet__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSend}>
            {busy ? "Sending…" : "Send offer"}
          </button>
        </div>
      </form>

      {full
        ? createPortal(
            <div
              className="card-focus card-focus--over-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={card.entity.name}
            >
              <button
                type="button"
                className="card-focus__backdrop"
                aria-label="Close"
                onClick={() => setFull(false)}
              />
              <div className="card-focus__panel">
                <div className="card-focus__face">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm card-focus__close"
                    aria-label="Close"
                    onClick={() => setFull(false)}
                  >
                    ✕
                  </button>
                  <MonkeyCard
                    entity={card.entity}
                    pathLevels={card.pathLevels}
                    mode="focus"
                    owned
                    degree={card.isParagon ? (degree ?? 1) : undefined}
                    visualSeed={visualSeed}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
