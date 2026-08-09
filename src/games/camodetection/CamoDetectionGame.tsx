import { useEffect, useRef, type CSSProperties } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { ResultsScreen } from "../../components/ResultsScreen";
import { CAMO_IMAGE } from "./config";
import { useCamoDetection } from "./useCamoDetection";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean; bestStreak: number }) => void;
};

export function CamoDetectionGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    toggleCell,
    submit,
    goNext,
    playAgain,
    buyContinue,
    continueCost,
    roundsPerRun,
    maxLives,
    recallSeconds,
  } = useCamoDetection();
  const { profile } = useAuth();
  const runEndNotified = useRef(false);

  useEffect(() => {
    if (state.phase === "results" && !runEndNotified.current) {
      runEndNotified.current = true;
      onRunEnd?.({
        cleared: state.clearedRun,
        bestStreak: state.bestStreak,
      });
    }
    if (state.phase !== "results") runEndNotified.current = false;
  }, [state.phase, state.clearedRun, state.bestStreak, onRunEnd]);

  useEffect(() => {
    if (state.phase !== "recalling") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, submit]);

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
      <div className="camo-page">
        <ResultsScreen
          coinsEarned={state.lastRun.score * (state.perfectRun ? 2 : 1)}
          cleared={state.clearedRun}
          perfect={state.perfectRun}
          bonusPack={state.bestStreak >= 4}
          continueAvailable={!state.freePlay}
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

  const watching = state.phase === "watching";
  const recalling = state.phase === "recalling";
  const revealed = state.phase === "reveal";
  const grid = state.round.grid;
  const cells = grid * grid;
  const attemptsUsed = maxLives - state.lives;
  const secondsLeft = Math.ceil(state.timeLeftMs / 1000);
  const timerPct = Math.max(
    0,
    Math.min(100, (state.timeLeftMs / (recallSeconds * 1000)) * 100),
  );
  const urgent = recalling && state.timeLeftMs <= 3000;
  const endLabel =
    state.lives <= 0 ||
    (!state.freePlay && state.round.round >= roundsPerRun)
      ? "DONE"
      : "NEXT";

  const camoSet = new Set(state.round.camo);
  const pickedSet = revealed
    ? new Set(state.feedback?.picked ?? [])
    : state.picked;

  let prompt = "Memorize the camo bloons…";
  if (recalling) prompt = "Tap where the camo were";
  if (revealed && state.feedback) {
    if (state.feedback.correct) prompt = `Detected! +${state.feedback.points}`;
    else if (state.feedback.timedOut) prompt = "Time’s up";
    else prompt = "Missed some camo";
  }

  return (
    <div
      className={`camo-page ${revealed ? "is-reveal" : ""} ${watching ? "is-watching" : ""}`}
    >
      <GameHeader
        title="CAMO DETECTION"
        icon=""
        round={state.round.round}
        roundsPerRun={roundsPerRun}
        freePlay={state.freePlay}
      />

      <main className="camo-main">
        <div className="camo-prompt">
          <div className="camo-prompt__row">
            <h2
              className={
                revealed
                  ? state.feedback?.correct
                    ? "is-win"
                    : "is-miss"
                  : undefined
              }
            >
              {prompt}
            </h2>
            <div className="camo-prompt__hud">
              <LivesMeter maxAttempts={maxLives} attemptsUsed={attemptsUsed} />
            </div>
          </div>
          <p className="camo-meta">
            {grid}×{grid} · {state.round.camo.length} camo
          </p>
          {recalling ? (
            <div
              className={`orderup-timer ${urgent ? "is-urgent" : ""}`}
              role="timer"
              aria-live="off"
              aria-label={`${secondsLeft} seconds left`}
            >
              <div className="orderup-timer__track">
                <div
                  className="orderup-timer__fill"
                  style={{ width: `${timerPct}%` }}
                />
              </div>
              <span className="orderup-timer__num">{secondsLeft}</span>
            </div>
          ) : null}
        </div>

        <div
          className={`camo-grid camo-grid--n${grid}`}
          style={{ "--camo-n": grid } as CSSProperties}
          role="grid"
          aria-label={`${grid} by ${grid} detection grid`}
        >
          {Array.from({ length: cells }, (_, i) => {
            const isCamo = camoSet.has(i);
            const isPicked = pickedSet.has(i);
            const showCamo =
              (watching && state.flashOn && isCamo) ||
              (revealed && (isCamo || isPicked)) ||
              (recalling && isPicked);

            let tone = "";
            if (revealed) {
              if (isCamo && isPicked) tone = "is-hit";
              else if (isCamo && !isPicked) tone = "is-missed";
              else if (!isCamo && isPicked) tone = "is-false";
            } else if (isPicked) {
              tone = "is-picked";
            }

            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                className={`camo-cell ${tone} ${showCamo ? "has-camo" : ""}`}
                disabled={!recalling}
                aria-pressed={isPicked}
                aria-label={
                  recalling
                    ? `Cell ${i + 1}${isPicked ? ", selected" : ""}`
                    : `Cell ${i + 1}`
                }
                onClick={() => toggleCell(i)}
              >
                {showCamo ? (
                  <img
                    src={CAMO_IMAGE}
                    alt=""
                    draggable={false}
                    className="camo-cell__img"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {recalling ? (
          <p className="camo-hint">
            Mark every camo spot, then submit · Enter
          </p>
        ) : watching ? (
          <p className="camo-hint">Watch closely…</p>
        ) : null}
      </main>

      {recalling ? (
        <div className="camo-next-bar">
          <button
            type="button"
            className="btn btn--primary btn--lg camo-next-bar__btn"
            onClick={submit}
            disabled={state.picked.size === 0}
          >
            SUBMIT ({state.picked.size}/{state.round.camo.length})
          </button>
        </div>
      ) : null}

      {revealed ? (
        <div className="camo-next-bar">
          <button
            type="button"
            className="btn btn--primary btn--lg camo-next-bar__btn"
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
