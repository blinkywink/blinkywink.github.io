import { useEffect, useId, useState } from "react";
import { MAX_MARKET_PRICE } from "../lib/marketplace";
import { formatPathLevels, type MonkeyCardSpec } from "../lib/pathCombos";
import { CashAmount } from "./CurrencyChip";

const MIN_OFFER = 10;

type Props = {
  card: MonkeyCardSpec;
  ownerName: string;
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
  ownerName,
  balance,
  busy,
  error,
  onClose,
  onSubmit,
}: Props) {
  const fieldId = useId();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  const path = card.isParagon ? "Paragon" : formatPathLevels(card.pathLevels);

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
        <p className="offer-sheet__kicker">Offer</p>
        <h2 className="offer-sheet__title">{card.entity.name}</h2>
        <p className="offer-sheet__meta">
          {path} · {ownerName}
        </p>

        <label className="offer-sheet__field" htmlFor={fieldId}>
          <span>Cash</span>
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

        <p className="offer-sheet__hint">
          Held until they accept, decline, or you cancel. Min{" "}
          <CashAmount amount={MIN_OFFER} size={14} />.
          {balance != null ? (
            <>
              {" "}
              You have <CashAmount amount={balance} size={14} />.
            </>
          ) : null}
        </p>

        {tooLow ? (
          <p className="offer-sheet__err">Offer must be at least 10 Cash.</p>
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
    </div>
  );
}
