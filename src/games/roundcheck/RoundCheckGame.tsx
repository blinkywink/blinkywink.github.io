import { useEffect, useMemo, useRef, useState } from "react";
import { GameHeader } from "../../components/GameHeader";
import { CashAmount } from "../../components/CurrencyChip";
import { LivesMeter } from "../../components/LivesMeter";
import { bloonLabel, type RoundSpawn } from "./rounds";
import {
  ROUND_CHECK_MAX_LIVES,
  ROUND_CHECK_SOLVES_TO_CLEAR,
  useRoundCheck,
} from "./useRoundCheck";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: {
    cleared: boolean;
    coinsEarned: number;
    solves: number;
    perfect: boolean;
  }) => void;
};

function SpawnChip({
  spawn,
  src,
}: {
  spawn: RoundSpawn;
  src: string;
}) {
  const [img, setImg] = useState(src);
  useEffect(() => setImg(src), [src]);

  return (
    <div className="roundcheck-chip" title={bloonLabel(spawn)}>
      <img
        className="roundcheck-chip__img"
        src={img}
        alt={bloonLabel(spawn)}
        draggable={false}
        onError={() => {
          const parts =
            img.split("/").pop()?.replace(".webp", "").split("-") ?? [];
          if (parts.length <= 1) return;
          setImg(`/images/bloons/btd6/${parts.slice(1).join("-")}.webp`);
        }}
      />
      <span className="roundcheck-chip__count">×{spawn.count}</span>
    </div>
  );
}

export function RoundCheckGame({ onBack: _onBack, onRunEnd }: Props) {
  const {
    state,
    remaining,
    lastHint,
    range,
    maxGuesses,
    submit,
    continueRun,
    playAgain,
    srcFor,
  } = useRoundCheck();
  const [pick, setPick] = useState(50);
  const prevStatus = useRef(state.status);
  const guessing = state.status === "playing";
  const runOver = state.status === "won" || state.status === "lost";
  const puzzleDone = state.status === "puzzle_done";
  const trackLo = range.lo;
  const trackHi = range.hi;

  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = state.status;
    if (was === "won" || was === "lost") return;
    if (state.status === "won" || state.status === "lost") {
      onRunEnd?.({
        cleared: state.status === "won",
        coinsEarned: state.reward,
        solves: state.solves,
        perfect:
          state.status === "won" &&
          state.perfectSoFar &&
          state.solves >= ROUND_CHECK_SOLVES_TO_CLEAR,
      });
    }
  }, [
    state.status,
    state.reward,
    state.solves,
    state.perfectSoFar,
    onRunEnd,
  ]);

  useEffect(() => {
    setPick(Math.round((range.lo + range.hi) / 2));
  }, [state.round.round, range.lo, range.hi]);

  const endTicks = useMemo(
    () => (trackLo === trackHi ? [trackLo] : [trackLo, trackHi]),
    [trackLo, trackHi],
  );

  function onGuess() {
    if (!guessing) return;
    if (pick < trackLo || pick > trackHi) return;
    submit(pick);
  }

  return (
    <div className={`roundcheck-page${runOver ? " is-done" : ""}`}>
      <GameHeader
        title="ROUND CHECK"
        icon=""
        round={Math.min(state.solves + 1, ROUND_CHECK_SOLVES_TO_CLEAR)}
        roundsPerRun={ROUND_CHECK_SOLVES_TO_CLEAR}
      />

      <main className="roundcheck-main">
        <div className="roundcheck-top">
          <div className="roundcheck-hud">
            <LivesMeter
              maxAttempts={ROUND_CHECK_MAX_LIVES}
              attemptsUsed={ROUND_CHECK_MAX_LIVES - state.lives}
            />
            <div
              className="roundcheck-tries"
              aria-label={`${remaining} guesses left`}
            >
              {Array.from({ length: maxGuesses }, (_, i) => {
                const g = state.guesses[i];
                return (
                  <span
                    key={i}
                    className={`roundcheck-tries__slot${g ? ` is-${g.hint}` : ""}${!g && i === state.guesses.length && guessing ? " is-next" : ""}`}
                  >
                    {g ? (
                      <>
                        <span className="roundcheck-tries__val">{g.value}</span>
                        {g.hint === "higher" || g.hint === "lower" ? (
                          <span
                            className="roundcheck-tries__arrow"
                            aria-hidden
                          >
                            {g.hint === "higher" ? "↑" : "↓"}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="roundcheck-board" aria-label="Bloon spawns">
            {state.round.spawns.map((spawn, i) => (
              <SpawnChip
                key={`${spawn.base}-${spawn.props.join("-")}-${i}`}
                spawn={spawn}
                src={srcFor(spawn)}
              />
            ))}
          </div>
        </div>

        <div className="roundcheck-dock">
          {guessing && lastHint && lastHint !== "correct" ? (
            <p className={`roundcheck-nudge is-${lastHint}`} aria-live="polite">
              {lastHint === "higher" ? "Higher" : "Lower"}
            </p>
          ) : (
            <p className="roundcheck-nudge is-spacer" aria-hidden>
              {"\u00a0"}
            </p>
          )}

          {guessing || puzzleDone ? (
            <div className={`roundcheck-slider${guessing ? "" : " is-done"}`}>
              <div className="roundcheck-slider__readout" aria-live="polite">
                <span className="roundcheck-slider__pick">
                  {guessing ? pick : state.round.round}
                </span>
              </div>

              <div className="roundcheck-slider__rail-wrap">
                <div className="roundcheck-slider__track">
                  <div
                    className="roundcheck-slider__rail roundcheck-slider__rail--live"
                    aria-hidden
                  />
                  <input
                    className="roundcheck-slider__input"
                    type="range"
                    min={trackLo}
                    max={Math.max(trackHi, trackLo)}
                    step={1}
                    value={guessing ? pick : state.round.round}
                    disabled={!guessing || trackLo === trackHi}
                    onChange={(e) => setPick(Number(e.target.value))}
                    aria-label={`Round ${trackLo} to ${trackHi}`}
                    aria-valuemin={trackLo}
                    aria-valuemax={trackHi}
                    aria-valuenow={guessing ? pick : state.round.round}
                  />
                </div>
              </div>

              <div className="roundcheck-slider__ticks" aria-hidden>
                {endTicks.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          ) : null}

          {guessing ? (
            <button
              type="button"
              className="roundcheck-form__guess"
              onClick={onGuess}
            >
              Guess
            </button>
          ) : puzzleDone ? (
            <div className="roundcheck-result">
              <p
                className={`roundcheck-result__status${state.lastOutcome === "solved" ? " is-win" : " is-miss"}`}
              >
                Round {state.round.round}
              </p>
              {state.lastPuzzleReward > 0 ? (
                <p className="roundcheck-result__cash">
                  <CashAmount amount={state.lastPuzzleReward} size={24} />
                </p>
              ) : null}
              <button
                type="button"
                className="roundcheck-form__guess"
                onClick={() => continueRun()}
              >
                Next
              </button>
            </div>
          ) : (
            <div className="roundcheck-result">
              <p
                className={`roundcheck-result__status${state.status === "won" ? " is-win" : " is-miss"}`}
              >
                {state.status === "won"
                  ? state.perfectSoFar
                    ? "Perfect!"
                    : "Cleared"
                  : "Out of lives"}
              </p>
              {state.reward > 0 ? (
                <p className="roundcheck-result__cash">
                  <CashAmount amount={state.reward} size={28} />
                </p>
              ) : null}
              <button
                type="button"
                className="roundcheck-form__guess"
                onClick={() => playAgain()}
              >
                Again
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
