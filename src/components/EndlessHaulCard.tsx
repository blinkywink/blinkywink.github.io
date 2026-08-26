import { useEffect, useState } from "react";
import { CashAmount } from "./CurrencyChip";
import { LoadingDots } from "./LoadingDots";
import { RewardsHaulActions } from "./RewardsHaulActions";
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
  onOpenShop: () => void;
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
  onOpenShop,
  onDismiss,
  onPlayNextBonus,
}: Props) {
  const [showBoard, setShowBoard] = useState(false);
  const label = scoreLabel(gameId);
  const score = report?.score ?? 0;
  const isNew = Boolean(report?.isNewBest);
  const neighbors = report?.neighbors ?? [];
  const bestScore = report?.bestScore ?? 0;
  const showBest = Boolean(report) && !isNew && bestScore > score;

  useEffect(() => {
    if (!showBoard) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowBoard(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBoard]);

  return (
    <div className="rewards-done" role="dialog" aria-label="Nice haul">
      <div className="rewards-done__card rewards-done__card--endless">
        <button
          type="button"
          className="rewards-done__close"
          aria-label="Close"
          onClick={onDismiss}
        >
          ✕
        </button>
        <h2>{isNew ? "New high score!" : "Nice haul"}</h2>

        <div className="rewards-done__score-row">
          <div className="rewards-done__score">
            <strong>{score.toLocaleString("en-US")}</strong>
            <span>{label}</span>
          </div>
          <div className="rewards-done__meta">
            {showBest ? (
              <span className="rewards-done__best-note">
                Best {bestScore.toLocaleString("en-US")}
              </span>
            ) : null}
            <button
              type="button"
              className="rewards-done__board-toggle"
              onClick={() => setShowBoard(true)}
            >
              View leaderboard<span aria-hidden="true"> →</span>
            </button>
          </div>
        </div>

        <div className="rewards-done__cash">
          <CashAmount amount={cashEarned} size={24} />
          <span className="rewards-done__cash-label">Cash earned</span>
        </div>

        <RewardsHaulActions
          onPlayAgain={onPlayAgain}
          onBackToGames={onBack}
          onOpenShop={onOpenShop}
          onPlayNextBonus={onPlayNextBonus}
        />
      </div>

      {showBoard ? (
        <div
          className="rewards-done-board"
          role="dialog"
          aria-label={`${label} leaderboard`}
          onClick={() => setShowBoard(false)}
        >
          <div
            className="rewards-done-board__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="rewards-done-board__back"
              aria-label="Back"
              onClick={() => setShowBoard(false)}
            >
              ←
            </button>
            <h2 className="rewards-done-board__title">{label}</h2>
            <p className="rewards-done-board__sub">Nearby scores</p>
            {loading ? (
              <LoadingDots label="Loading scores" />
            ) : neighbors.length === 0 ? (
              <p className="rewards-done-board__empty">
                Sign in to place on the {label.toLowerCase()} board.
              </p>
            ) : (
              <ol className="rewards-done__ranks rewards-done-board__ranks">
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
        </div>
      ) : null}
    </div>
  );
}
