import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { AnswerReveal } from "../../components/AnswerReveal";
import { ChallengeImage } from "../../components/ChallengeImage";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { MapAnswerSearch } from "../../components/MapAnswerSearch";
import { ResultsScreen } from "../../components/ResultsScreen";
import type { TransformParams } from "../../utils/imageProcessing";
import { useGeoguessr } from "./useGeoguessr";

type Props = {
  onBack: () => void;
};

export function GeoguessrGame({ onBack }: Props) {
  const { profile } = useAuth();
  const {
    state,
    answer,
    goNext,
    playAgain,
    buyContinue,
    continueCost,
    roundsPerRun,
    maxLives,
  } = useGeoguessr();
  const [activeTransform, setActiveTransform] =
    useState<TransformParams | null>(null);
  const [correctFlashDone, setCorrectFlashDone] = useState(false);

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

  if (state.phase === "results" && state.lastRun) {
    return (
      <div className="zoomed-page">
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
        title="GEOGUESSR"
        icon=""
        round={challenge.round}
        roundsPerRun={roundsPerRun}
        freePlay={state.freePlay}
        onBack={onBack}
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
              <p className="reveal-sub">{challenge.correct.difficulty}</p>
              <LivesMeter maxAttempts={maxLives} attemptsUsed={livesLost} />
            </>
          ) : (
            <>
              <h2>Which map is this?</h2>
              <LivesMeter maxAttempts={maxLives} attemptsUsed={livesLost} />
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
            <MapAnswerSearch
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
