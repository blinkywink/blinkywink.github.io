import type { ReactNode } from "react";

type Props = {
  onPlayAgain: () => void;
  onBackToGames: () => void;
  onOpenShop: () => void;
  onPlayNextBonus?: () => void;
};

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Forward arrow — next game */
function IconNext() {
  return (
    <IconFrame>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconFrame>
  );
}

/** Clockwise refresh — arc meets the arrow cleanly */
function IconRetry() {
  return (
    <IconFrame>
      <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </IconFrame>
  );
}

/** 2×2 tiles — games list */
function IconGames() {
  return (
    <IconFrame>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </IconFrame>
  );
}

/** Flat shopping bag — shop */
function IconShop() {
  return (
    <IconFrame>
      <path d="M5 9h14v10.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V9Z" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
    </IconFrame>
  );
}

/** Compact icon row for Nice Haul / Run over actions. */
export function RewardsHaulActions({
  onPlayAgain,
  onBackToGames,
  onOpenShop,
  onPlayNextBonus,
}: Props) {
  return (
    <div className="rewards-done__actions" role="group" aria-label="Next steps">
      {onPlayNextBonus ? (
        <button
          type="button"
          className="rewards-done__action"
          onClick={onPlayNextBonus}
          aria-label="Next bonus game"
        >
          <span className="rewards-done__action-icon">
            <IconNext />
          </span>
          <span className="rewards-done__action-label">Next</span>
        </button>
      ) : null}
      <button
        type="button"
        className="rewards-done__action"
        onClick={onPlayAgain}
        aria-label="Retry"
      >
        <span className="rewards-done__action-icon">
          <IconRetry />
        </span>
        <span className="rewards-done__action-label">Retry</span>
      </button>
      <button
        type="button"
        className="rewards-done__action"
        onClick={onBackToGames}
        aria-label="Games"
      >
        <span className="rewards-done__action-icon">
          <IconGames />
        </span>
        <span className="rewards-done__action-label">Games</span>
      </button>
      <button
        type="button"
        className="rewards-done__action"
        onClick={onOpenShop}
        aria-label="Shop"
      >
        <span className="rewards-done__action-icon">
          <IconShop />
        </span>
        <span className="rewards-done__action-label">Shop</span>
      </button>
    </div>
  );
}
