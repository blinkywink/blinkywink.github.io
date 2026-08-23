import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cardSpecById } from "../lib/cardCatalog";
import { MonkeyCard } from "./MonkeyCard";
import { ParagonXpBar } from "./ParagonXpBar";

type Side = {
  label: string;
  seed: number | null | undefined;
  degree?: number;
  xp?: number;
};

type Props = {
  cardId: string;
  mine: Side;
  theirs: Side;
  className?: string;
};

function seedLabel(seed: number | null | undefined): string {
  if (seed == null || !Number.isFinite(seed)) return "—";
  return `#${Math.floor(seed)}`;
}

/** Side-by-side You vs Them copies for the same exchange card. */
export function ExchangeCompare({ cardId, mine, theirs, className = "" }: Props) {
  const card = cardSpecById(cardId);
  const [focusSide, setFocusSide] = useState<"mine" | "theirs" | null>(null);

  useEffect(() => {
    if (!focusSide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusSide(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [focusSide]);

  if (!card) {
    return <p className="exchange-compare__missing">Card not found.</p>;
  }

  const isParagon = card.isParagon;
  const myDeg = isParagon ? (mine.degree ?? 1) : null;
  const theirDeg = isParagon ? (theirs.degree ?? 1) : null;
  const degDiff =
    myDeg != null && theirDeg != null ? theirDeg - myDeg : null;

  const focused = focusSide === "mine" ? mine : focusSide === "theirs" ? theirs : null;

  return (
    <div className={`exchange-compare ${className}`.trim()}>
      <div className="exchange-compare__sides">
        <figure className="exchange-compare__side">
          <figcaption>{mine.label}</figcaption>
          <button
            type="button"
            className="exchange-compare__card"
            title={`View ${mine.label}'s copy`}
            onClick={() => setFocusSide("mine")}
          >
            <MonkeyCard
              entity={card.entity}
              pathLevels={card.pathLevels}
              mode="preview"
              owned
              degree={isParagon ? (mine.degree ?? 1) : undefined}
              visualSeed={mine.seed}
            />
          </button>
          <p className="exchange-compare__meta">
            Art seed {seedLabel(mine.seed)}
            {isParagon ? ` · Degree ${myDeg}` : null}
          </p>
        </figure>

        <div className="exchange-compare__vs" aria-hidden>
          ↔
        </div>

        <figure className="exchange-compare__side">
          <figcaption>{theirs.label}</figcaption>
          <button
            type="button"
            className="exchange-compare__card"
            title={`View ${theirs.label}'s copy`}
            onClick={() => setFocusSide("theirs")}
          >
            <MonkeyCard
              entity={card.entity}
              pathLevels={card.pathLevels}
              mode="preview"
              owned
              degree={isParagon ? (theirs.degree ?? 1) : undefined}
              visualSeed={theirs.seed}
            />
          </button>
          <p className="exchange-compare__meta">
            Art seed {seedLabel(theirs.seed)}
            {isParagon ? ` · Degree ${theirDeg}` : null}
          </p>
        </figure>
      </div>

      {degDiff != null ? (
        <p className="exchange-compare__summary">
          {degDiff === 0
            ? `Both at degree ${myDeg}.`
            : degDiff > 0
              ? `Their degree is +${degDiff} higher.`
              : `Your degree is +${Math.abs(degDiff)} higher.`}
        </p>
      ) : null}

      {focused
        ? createPortal(
            <div
              className="card-focus card-focus--over-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`${focused.label} — ${card.entity.name}`}
            >
              <button
                type="button"
                className="card-focus__backdrop"
                aria-label="Close"
                onClick={() => setFocusSide(null)}
              />
              <div className="card-focus__panel">
                <div className="card-focus__face">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm card-focus__close"
                    aria-label="Close"
                    onClick={() => setFocusSide(null)}
                  >
                    ✕
                  </button>
                  <MonkeyCard
                    entity={card.entity}
                    pathLevels={card.pathLevels}
                    mode="focus"
                    owned
                    degree={isParagon ? (focused.degree ?? 1) : undefined}
                    visualSeed={focused.seed}
                  />
                </div>
                {isParagon ? (
                  <ParagonXpBar
                    degree={focused.degree ?? 1}
                    xp={focused.xp ?? 0}
                  />
                ) : null}
                <p className="exchange-compare__focus-caption">
                  {focused.label}
                  {" · "}
                  Art seed {seedLabel(focused.seed)}
                  {isParagon ? ` · Degree ${focused.degree ?? 1}` : null}
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
