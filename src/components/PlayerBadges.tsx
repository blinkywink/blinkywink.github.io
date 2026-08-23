import { badgesFromIds } from "../lib/profileBadges";
import { RankMedal } from "./RankMedal";

type Props = {
  rank?: number | null;
  badgeIds?: readonly string[] | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Cap achievement badges; overflow shows "…". Rank medal always shown. */
  maxVisible?: number;
};

const SIZE_PX = { sm: 32, md: 40, lg: 56 } as const;

export function PlayerBadges({
  rank,
  badgeIds,
  size = "sm",
  className,
  maxVisible,
}: Props) {
  const extras = badgesFromIds(badgeIds);
  if ((rank == null || rank < 1 || rank > 50) && extras.length === 0) {
    return null;
  }
  const px = SIZE_PX[size];
  const capped =
    maxVisible != null && maxVisible >= 0
      ? extras.slice(0, maxVisible)
      : extras;
  const hidden = extras.slice(capped.length);
  const moreTip =
    hidden.length > 0
      ? hidden.map((b) => b.label).join(", ")
      : undefined;

  return (
    <span className={`player-badges${className ? ` ${className}` : ""}`}>
      <RankMedal rank={rank} size={size} />
      {capped.map((badge) => (
        <span
          key={badge.id}
          className="rank-medal-wrap"
          data-tip={badge.label}
        >
          <img
            className={`rank-medal rank-medal--${size}`}
            src={badge.src}
            alt={badge.label}
            width={px}
            height={px}
            draggable={false}
          />
        </span>
      ))}
      {hidden.length > 0 ? (
        <span
          className="rank-medal-wrap player-badges__more"
          data-tip={moreTip}
          title={moreTip}
          aria-label={`${hidden.length} more badges: ${moreTip}`}
        >
          …
        </span>
      ) : null}
    </span>
  );
}
