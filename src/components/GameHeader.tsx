type Props = {
  title?: string;
  /** Decorative mark before the title. Pass empty string to hide. */
  icon?: string;
  round?: number;
  roundsPerRun?: number;
  freePlay?: boolean;
};

/** Compact in-game title bar. Use the site logo to return home. */
export function GameHeader({
  title = "ZOOMED",
  icon = "🔍",
  round,
  roundsPerRun,
  freePlay = false,
}: Props) {
  return (
    <header className="game-header">
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
    </header>
  );
}
