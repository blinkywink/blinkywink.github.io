import { medalForRank } from "../lib/leaderboardRanks";

type Props = {
  rank: number | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_PX = { sm: 32, md: 40, lg: 56 } as const;

export function RankMedal({ rank, size = "sm", className }: Props) {
  const medal = medalForRank(rank);
  if (!medal) return null;
  const px = SIZE_PX[size];
  return (
    <span
      className={`rank-medal-wrap${className ? ` ${className}` : ""}`}
      data-tip={medal.label}
    >
      <img
        className={`rank-medal rank-medal--${size}`}
        src={medal.src}
        alt={medal.label}
        width={px}
        height={px}
        draggable={false}
      />
    </span>
  );
}
