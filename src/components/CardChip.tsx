import { formatPathLevels, type MonkeyCardSpec } from "../lib/pathCombos";
import { cardSpecById } from "../lib/cardCatalog";

type Props = {
  cardId?: string;
  card?: MonkeyCardSpec | null;
  selected?: boolean;
  locked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  actionLabel?: string;
};

/** Lightweight card row — portrait thumb + text, not a full MonkeyCard. */
export function CardChip({
  cardId,
  card: cardProp,
  selected = false,
  locked = false,
  disabled = false,
  onClick,
  actionLabel,
}: Props) {
  const card = cardProp ?? (cardId ? cardSpecById(cardId) : null);
  if (!card) {
    return (
      <div className="card-chip card-chip--missing">
        <span>{cardId ?? "Unknown card"}</span>
      </div>
    );
  }

  const path = card.isParagon
    ? "Paragon"
    : formatPathLevels(card.pathLevels);
  const body = (
    <>
      <img
        className="card-chip__art"
        src={card.entity.image}
        alt=""
        draggable={false}
        loading="lazy"
      />
      <span className="card-chip__meta">
        <strong>{card.entity.name}</strong>
        <span>
          {path} · {card.tower}
        </span>
      </span>
      {actionLabel ? (
        <span className="card-chip__action">{actionLabel}</span>
      ) : null}
    </>
  );

  if (locked || !onClick) {
    return <div className="card-chip is-locked">{body}</div>;
  }

  return (
    <button
      type="button"
      className={`card-chip${selected ? " is-selected" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
