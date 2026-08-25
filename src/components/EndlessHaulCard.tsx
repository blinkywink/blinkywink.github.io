import { CashAmount } from "./CurrencyChip";
import { LoadingDots } from "./LoadingDots";
import type {
  EndlessGameId,
  GameScoreReport,
} from "../lib/gameScores";
import { scoreLabel } from "../lib/gameScores";

type Props = {
  gameId: EndlessGameId;
  cashEarned: number;
  report: GameScoreReport | null;
  loading: boolean;
  onPlayAgain: () => void;
  onBack: () => void;
  onDismiss: () => void;
  onPlayNextBonus?: () => void;
};

export function EndlessHaulCard({
  gameId,
  cashEarned,
  report,
  loading,
  onPlayAgain,
  onBack,
  onDismiss,
  onPlayNextBonus,
}: Props) {
  const label = scoreLabel(gameId);
  const score = report?.score ?? 0;
  const isNew = Boolean(report?.isNewBest);
  const neighbors = report?.neighbors ?? [];

  return (
    <div className="rewards-done" role="dialog" aria-label="Run summary">
      <div className="rewards-done__card rewards-done__card--endless">
        <button
          type="button"
          className="rewards-done__close"
          aria-label="Close"
          onClick={onDismiss}
        >
          ✕
        </button>
        <p className="eyebrow">Run over</p>
        <h2>{isNew ? "New high score!" : "Nice haul"}</h2>

        <div className="rewards-done__score-row">
          <div className="rewards-done__score">
            <strong>{score.toLocaleString("en-US")}</strong>
            <span>{label}</span>
          </div>
          {report && !isNew && report.bestScore > score ? (
            <p className="rewards-done__best-note">
              Best {report.bestScore.toLocaleString("en-US")}
            </p>
          ) : null}
        </div>

        <div className="rewards-done__cash">
          <CashAmount amount={cashEarned} size={24} />
          <span className="rewards-done__cash-label">Cash earned</span>
        </div>

        <div className="rewards-done__board">
          <p className="rewards-done__board-label">Nearby scores</p>
          {loading ? (
            <LoadingDots label="Loading scores" />
          ) : neighbors.length === 0 ? (
            <p className="rewards-done__board-empty">
              Sign in to place on the {label.toLowerCase()} board.
            </p>
          ) : (
            <ol className="rewards-done__ranks">
              {neighbors.map((row) => (
                <li
                  key={`${row.userId}-${row.rank}`}
                  className={row.isYou ? "is-you" : undefined}
                >
                  <span className="rewards-done__ranks-place">#{row.rank}</span>
                  <span className="rewards-done__ranks-name">
                    {row.isYou ? "You" : row.username}
                  </span>
                  <span className="rewards-done__ranks-score">
                    {row.score.toLocaleString("en-US")}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rewards-done__actions">
          {onPlayNextBonus ? (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={onPlayNextBonus}
            >
              Play next bonus game
            </button>
          ) : null}
          <button
            type="button"
            className={`btn btn--lg${onPlayNextBonus ? " btn--secondary" : " btn--primary"}`}
            onClick={onPlayAgain}
          >
            Play again
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--lg"
            onClick={onBack}
          >
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
}
