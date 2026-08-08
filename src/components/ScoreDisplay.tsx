import type { Feedback } from "../games/zoomed/useZoomedGame";

type Props = {
  score: number;
};

/** Always-visible score chip (Monkey Money icon). */
export function ScoreDisplay({ score }: Props) {
  return (
    <div className="stat-chip stat-chip--coins">
      <img
        src="/images/ui/money-icon.webp"
        alt=""
        className="stat-chip__coin"
        width={20}
        height={20}
      />
      <span className="stat-chip__value">{score.toLocaleString()}</span>
    </div>
  );
}

type PopupProps = {
  feedback: Feedback | null;
};

/** Compact feedback under the prompt — misses use the image flash instead. */
export function ScorePopup({ feedback }: PopupProps) {
  if (!feedback || feedback.kind === "miss") return null;

  if (feedback.kind === "correct") {
    return (
      <div
        className="feedback-toast feedback-toast--correct"
        key={`ok-${feedback.streak}-${feedback.breakdown.points}`}
        role="status"
      >
        <div className="feedback-toast__title">Correct!</div>
        <div className="feedback-toast__points">
          +{feedback.breakdown.points.toLocaleString()}
        </div>
        {feedback.breakdown.attemptMultiplier < 1 ? (
          <div className="feedback-toast__meta">
            {Math.round(feedback.breakdown.attemptMultiplier * 100)}% after retries
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="feedback-toast feedback-toast--wrong"
      key={feedback.correctName}
      role="status"
    >
      <div className="feedback-toast__title">Out of lives</div>
      <div className="feedback-toast__meta">
        It was {feedback.correctName}
      </div>
    </div>
  );
}
