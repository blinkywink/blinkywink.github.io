type Props = {
  title?: string;
  /** Decorative mark before the title. Pass empty string to hide. */
  icon?: string;
  round?: number;
  roundsPerRun?: number;
  freePlay?: boolean;
  onBack?: () => void;
};

export function GameHeader({
  title = "ZOOMED",
  icon = "🔍",
  round,
  roundsPerRun,
  freePlay = false,
  onBack,
}: Props) {
  return (
    <header className="game-header">
      <div className="game-header__left">
        {onBack ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            ← Home
          </button>
        ) : (
          <span className="game-header__brand">ZOOMED</span>
        )}
      </div>
      <div className="game-header__center">
        <h1 className="game-header__title">
          {icon ? <span aria-hidden="true">{icon} </span> : null}
          {title}
        </h1>
        {round != null ? (
          freePlay ? (
            <p className="game-header__round">
              FREE <span className="muted">{round}</span>
            </p>
          ) : roundsPerRun != null ? (
            <p className="game-header__round">
              ROUND {round}
              <span className="muted"> / {roundsPerRun}</span>
            </p>
          ) : null
        ) : null}
      </div>
      <div className="game-header__right" />
    </header>
  );
}
