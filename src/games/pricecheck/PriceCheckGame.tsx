import { useEffect, useRef } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { formatPathLevels } from "../../lib/pathCombos";
import { isTypingTarget } from "../../lib/keyboard";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { ResultsScreen } from "../../components/ResultsScreen";
import { formatCash, type PricedCombo } from "./costs";
import { usePriceCheck, type Guess } from "./usePriceCheck";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean; correctCount: number; coinsEarned: number }) => void;
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
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        onPick(sideKey);
      }}
      onClick={() => {
        if (disabled) return;
        onPick(sideKey);
      }}
      aria-label={`Pick ${label}, ${side.combos.length} tower${side.combos.length === 1 ? "" : "s"}`}
    >
      <div className="price-side__art">
        {side.combos.map((c) => (
          <ComboTile key={c.id} combo={c} revealed={revealed} />
        ))}
      </div>
      {revealed ? (
        <span className="price-side__total">{formatCash(side.total)}</span>
      ) : null}
    </button>
  );
}

export function PriceCheckGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    guess,
    goNext,
    buyContinue,
    continueCost,
    roundsPerRun,
    maxLives,
    timerSeconds,
  } = usePriceCheck();
  const { profile } = useAuth();
  const runEndNotified = useRef(false);

  useEffect(() => {
    if (state.phase === "results" && !runEndNotified.current) {
      runEndNotified.current = true;
      onRunEnd?.({
        cleared: state.clearedRun,
        correctCount: state.correct,
        coinsEarned:
          (state.lastRun?.score ?? 0) * (state.perfectRun ? 2 : 1),
      });
    }
    if (state.phase !== "results") runEndNotified.current = false;
  }, [state.phase, state.clearedRun, state.correct, state.lastRun, state.perfectRun, onRunEnd]);

  useEffect(() => {
    if (state.phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
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
      if (isTypingTarget(e.target)) return;
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
          coinsEarned={
            state.lastRun.score * (state.perfectRun ? 2 : 1)
          }
          cleared={state.clearedRun}
          perfect={state.perfectRun}
          continueAvailable={!state.freePlay && !state.clearedRun}
          continueCost={continueCost}
          canAffordContinue={(profile?.coins ?? 0) >= continueCost}
          continueBusy={state.continueBusy}
          continueError={state.continueError}
          onContinue={() => {
            void buyContinue();
          }}
          onBack={onBack}
        />
      </div>
    );
  }

  const revealed = state.phase === "reveal";
  const playing = state.phase === "playing";
  const attemptsUsed = maxLives - state.lives;
  const secondsLeft = Math.ceil(state.timeLeftMs / 1000);
  const urgent = playing && state.timeLeftMs <= 3000;
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
      />

      <main className="price-main">
        <div className="price-prompt">
          <div className="price-prompt__row">
            <h2>Which side costs more?</h2>
            <div className="price-prompt__hud">
              <LivesMeter maxAttempts={maxLives} attemptsUsed={attemptsUsed} />
            </div>
          </div>
          {playing ? (
            <div
              className={`orderup-timer ${urgent ? "is-urgent" : ""}`}
              role="timer"
              aria-live="off"
              aria-label={`${secondsLeft} seconds left`}
            >
              <div className="orderup-timer__track">
                <div
                  className="orderup-timer__fill"
                  key={state.round.round}
                  style={{ animationDuration: `${timerSeconds}s` }}
                />
              </div>
              <span className="orderup-timer__num">{secondsLeft}</span>
            </div>
          ) : state.feedback ? (
            <p
              className={`price-result ${state.feedback.correct ? "is-win" : "is-miss"}`}
            >
              {state.feedback.correct
                ? `Correct! +${state.feedback.points}`
                : state.feedback.timedOut
                  ? `Time’s up −${state.feedback.penalty}`
                  : `Wrong −${state.feedback.penalty}`}
            </p>
          ) : null}
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
