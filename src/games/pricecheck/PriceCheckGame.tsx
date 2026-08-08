import { useEffect } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { formatPathLevels } from "../../lib/pathCombos";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { ResultsScreen } from "../../components/ResultsScreen";
import { formatCash, type PricedCombo } from "./costs";
import { usePriceCheck, type Guess } from "./usePriceCheck";

type Props = {
  onBack: () => void;
};

function ComboTile({
  combo,
  revealed,
}: {
  combo: PricedCombo;
  revealed: boolean;
}) {
  return (
    <article className="price-tile">
      <img
        className="price-tile__img"
        src={combo.entity.image}
        alt=""
        draggable={false}
      />
      <div className="price-tile__caption">
        <span className="price-tile__path">
          {formatPathLevels(combo.pathLevels)}
        </span>
        <span className="price-tile__name">{combo.entity.name}</span>
        {revealed ? (
          <span className="price-tile__cost">{formatCash(combo.cost)}</span>
        ) : null}
      </div>
    </article>
  );
}

function SidePanel({
  label,
  side,
  sideKey,
  revealed,
  feedback,
  disabled,
  onPick,
}: {
  label: string;
  side: { combos: PricedCombo[]; total: number };
  sideKey: Guess;
  revealed: boolean;
  feedback: {
    guess: Guess;
    correct: boolean;
    leftTotal: number;
    rightTotal: number;
  } | null;
  disabled: boolean;
  onPick: (g: Guess) => void;
}) {
  const n = Math.min(side.combos.length, 5);
  const picked = revealed && feedback?.guess === sideKey;
  let tone = "";
  if (picked) {
    tone = feedback?.correct ? "is-win" : "is-miss";
  }

  return (
    <button
      type="button"
      className={`price-side price-side--n${n} ${tone}`}
      disabled={disabled}
      onClick={() => onPick(sideKey)}
      aria-label={`Pick ${label} — ${side.combos.length} tower${side.combos.length === 1 ? "" : "s"}`}
    >
      <span className="price-side__label">{label}</span>
      <div className="price-side__art">
        {side.combos.map((c) => (
          <ComboTile key={c.id} combo={c} revealed={revealed} />
        ))}
      </div>
      {revealed ? (
        <span className="price-side__total">{formatCash(side.total)}</span>
      ) : (
        <span className="price-side__hint">Higher</span>
      )}
    </button>
  );
}

export function PriceCheckGame({ onBack }: Props) {
  const {
    state,
    guess,
    goNext,
    playAgain,
    buyContinue,
    continueCost,
    roundsPerRun,
    maxLives,
  } = usePriceCheck();
  const { profile } = useAuth();

  useEffect(() => {
    if (state.phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        guess("left");
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        guess("right");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, guess]);

  useEffect(() => {
    if (state.phase !== "reveal") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, goNext]);

  if (state.phase === "results" && state.lastRun) {
    return (
      <div className="price-page">
        <ResultsScreen
          coinsEarned={state.lastRun.score}
          cleared={state.clearedRun}
          continueCost={continueCost}
          canAffordContinue={(profile?.coins ?? 0) >= continueCost}
          continueBusy={state.continueBusy}
          continueError={state.continueError}
          onContinue={() => {
            void buyContinue();
          }}
          onPlayAgain={playAgain}
          onBack={onBack}
        />
      </div>
    );
  }

  const revealed = state.phase === "reveal";
  const attemptsUsed = maxLives - state.lives;
  const endLabel =
    state.lives <= 0 ||
    (!state.freePlay && state.round.round >= roundsPerRun)
      ? "DONE"
      : "NEXT";

  return (
    <div className={`price-page ${revealed ? "is-reveal" : ""}`}>
      <GameHeader
        title="PRICE CHECK"
        icon=""
        round={state.round.round}
        roundsPerRun={roundsPerRun}
        freePlay={state.freePlay}
        onBack={onBack}
      />

      <main className="price-main">
        <div className="price-prompt">
          <div className="price-prompt__row">
            <h2>Which side costs more?</h2>
            <div className="price-prompt__hud">
              <LivesMeter maxAttempts={maxLives} attemptsUsed={attemptsUsed} />
            </div>
          </div>
        </div>

        <div className={`price-arena ${revealed ? "is-reveal" : ""}`}>
          <SidePanel
            label="Left"
            side={state.round.left}
            sideKey="left"
            revealed={revealed}
            feedback={state.feedback}
            disabled={revealed}
            onPick={guess}
          />
          <div className="price-vs" aria-hidden>
            <span>VS</span>
          </div>
          <SidePanel
            label="Right"
            side={state.round.right}
            sideKey="right"
            revealed={revealed}
            feedback={state.feedback}
            disabled={revealed}
            onPick={guess}
          />
        </div>

        {!revealed ? (
          <p className="price-keys">← / → or tap a side</p>
        ) : null}
      </main>

      {revealed ? (
        <div className="price-next-bar">
          <button
            type="button"
            className="btn btn--primary btn--lg price-next-bar__btn"
            onClick={goNext}
            autoFocus
          >
            {endLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
