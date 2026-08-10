import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { AnswerReveal } from "../../components/AnswerReveal";
import { AnswerSearch } from "../../components/AnswerSearch";
import { ChallengeImage } from "../../components/ChallengeImage";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { ResultsScreen } from "../../components/ResultsScreen";
import type { TransformParams } from "../../utils/imageProcessing";
import { useZoomedGame } from "./useZoomedGame";

type Props = {
  onBack: () => void;
  /** Fired once when results show (clear and/or accuracy). */
  onRunEnd?: (info: { cleared: boolean; correctCount: number; coinsEarned: number }) => void;
};

export function ZoomedGame({ onBack, onRunEnd }: Props) {
  const { profile } = useAuth();
  const {
    state,
    answer,
    skip,
    goNext,
    buyContinue,
    continueCost,
    roundsPerRun,
    maxLives,
  } = useZoomedGame();
  const [activeTransform, setActiveTransform] =
    useState<TransformParams | null>(null);
  const [correctFlashDone, setCorrectFlashDone] = useState(false);
  const runEndNotified = useRef(false);

  const handleTransformChange = useCallback((transform: TransformParams) => {
    setActiveTransform(transform);
  }, []);

  const isCorrectPending =
    state.phase === "feedback" && state.feedback?.kind === "correct";

  useEffect(() => {
    if (!isCorrectPending) {
      setCorrectFlashDone(false);
      return;
    }
    setCorrectFlashDone(false);
    const t = window.setTimeout(() => setCorrectFlashDone(true), 1000);
    return () => window.clearTimeout(t);
  }, [isCorrectPending, state.challenge?.round]);

  useEffect(() => {
    if (state.phase === "results" && !runEndNotified.current) {
      runEndNotified.current = true;
      onRunEnd?.({
        cleared: state.clearedRun,
        correctCount: state.correctCount,
        coinsEarned:
          (state.lastRun?.score ?? 0) * (state.perfectRun ? 2 : 1),
      });
    }
    if (state.phase !== "results") runEndNotified.current = false;
  }, [state.phase, state.clearedRun, state.correctCount, state.lastRun, state.perfectRun, onRunEnd]);

  if (state.phase === "results" && state.lastRun) {
    return (
      <div className="zoomed-page">
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

  const challenge = state.challenge;
  if (!challenge) return null;

  const showMissFlash = state.feedback?.kind === "miss";
  const showCorrectFlash = isCorrectPending && !correctFlashDone;
  const revealing =
    state.phase === "feedback" &&
    (state.feedback?.kind === "wrong" ||
      (state.feedback?.kind === "correct" && correctFlashDone));
  const searchLocked = showMissFlash || showCorrectFlash;
  const livesLost = maxLives - state.lives;
  const endRunNext =
    state.lives <= 0 ||
    (!state.freePlay && challenge.round >= roundsPerRun);

  const flashPoints =
    state.feedback?.kind === "correct"
      ? state.feedback.breakdown.points
      : undefined;

  return (
    <div className={`zoomed-page ${revealing ? "zoomed-page--reveal" : ""}`}>
      <GameHeader
        title="ZOOMED"
        icon=""
        round={challenge.round}
        roundsPerRun={roundsPerRun}
        freePlay={state.freePlay}
      />

      <main className="zoomed-main">
        <div
          className={`zoomed-stage ${revealing ? "zoomed-stage--reveal" : ""}`}
        >
          {revealing ? (
            <AnswerReveal
              imageSrc={challenge.correct.image}
              name={challenge.correct.name}
              transform={activeTransform}
            />
          ) : (
            <ChallengeImage
              imageSrc={challenge.correct.image}
              difficulty={challenge.difficulty}
              seed={`${challenge.round}-${challenge.correct.id}-${challenge.startedAt}`}
              zoomOutSteps={
                showMissFlash
                  ? Math.max(0, state.attemptsUsed - 1)
                  : state.attemptsUsed
              }
              flash={
                showMissFlash ? "miss" : showCorrectFlash ? "correct" : null
              }
              flashPoints={flashPoints}
              onTransformChange={handleTransformChange}
            />
          )}
        </div>

        <div className="zoomed-prompt">
          {revealing ? (
            <>
              <h2 className="reveal-name">{challenge.correct.name}</h2>
              <p className="reveal-sub">
                {challenge.correct.type === "tower"
                  ? challenge.correct.category
                  : challenge.correct.type === "paragon"
                    ? `${challenge.correct.tower} · Paragon`
                    : challenge.correct.tower}
              </p>
              <LivesMeter maxAttempts={maxLives} attemptsUsed={livesLost} />
            </>
          ) : (
            <>
              <h2>What is this?</h2>
              <LivesMeter maxAttempts={maxLives} attemptsUsed={livesLost} />
              {state.attemptsUsed >= 2 ? (
                <p className="guess-hint" role="status">
                  Hint: {challenge.correct.tower}
                </p>
              ) : null}
              <button
                type="button"
                className="guess-skip"
                onClick={skip}
                disabled={searchLocked}
              >
                Skip (costs a life)
              </button>
            </>
          )}
        </div>

        <div className="zoomed-controls">
          {revealing ? (
            <div className="reveal-actions">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={goNext}
                autoFocus
              >
                {endRunNext ? "DONE" : "NEXT"}
              </button>
            </div>
          ) : (
            <AnswerSearch
              roundKey={`${challenge.round}-${challenge.correct.id}`}
              disabled={searchLocked}
              status="idle"
              eliminatedIds={state.eliminatedIds}
              onSelect={answer}
            />
          )}
        </div>
      </main>
    </div>
  );
}
