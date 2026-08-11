import { badgesFromIds } from "../lib/profileBadges";
import { RankMedal } from "./RankMedal";

type Props = {
  rank?: number | null;
  badgeIds?: readonly string[] | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function PlayerBadges({
  rank,
  badgeIds,
  size = "sm",
  className,
}: Props) {
  const extras = badgesFromIds(badgeIds);
  if ((rank == null || rank < 1 || rank > 50) && extras.length === 0) {
    return null;
  }
  const px = size === "lg" ? 56 : size === "md" ? 40 : 32;
  return (
    <span className={`player-badges${className ? ` ${className}` : ""}`}>
      <RankMedal rank={rank} size={size} />
      {extras.map((badge) => (
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
    </span>
  );
}
