import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "./avatar";
import { cached, CacheTtl } from "./cache";
import { normalizeAccentColor } from "./profileCosmetics";
import { normalizeBadgeIds } from "./profileBadges";
import { supabase } from "./supabase";

export type LeaderboardEntry = {
  id: string;
  username: string;
  coins_earned: number;
  avatar: AvatarCrop;
  accentColor: string | null;
  rank: number;
  badgeIds: string[];
};

export type LeaderboardMedal = {
  src: string;
  label: string;
};

const MEDAL_TIERS: { max: number; src: string; label: string }[] = [
  {
    max: 1,
    src: "/images/ui/medals/1-black-diamond.webp",
    label: "1st place on the leaderboard",
  },
  {
    max: 2,
    src: "/images/ui/medals/2-red-diamond.webp",
    label: "2nd place on the leaderboard",
  },
  {
    max: 3,
    src: "/images/ui/medals/3-diamond.webp",
    label: "3rd place on the leaderboard",
  },
  {
    max: 4,
    src: "/images/ui/medals/4-gold-diamond.webp",
    label: "4th place on the leaderboard",
  },
  {
    max: 5,
    src: "/images/ui/medals/5-double-gold.webp",
    label: "5th place on the leaderboard",
  },
  {
    max: 10,
    src: "/images/ui/medals/6-10-silver.webp",
    label: "Top 10 on the leaderboard (6th-10th)",
  },
  {
    max: 50,
    src: "/images/ui/medals/11-50-bronze.webp",
    label: "Top 50 on the leaderboard (11th-50th)",
  },
];

/** Current-rank medal. Null once they fall outside the top 50. */
export function medalForRank(
  rank: number | null | undefined,
): LeaderboardMedal | null {
  if (rank == null || rank < 1 || rank > 50) return null;
  return MEDAL_TIERS.find((tier) => rank <= tier.max) ?? null;
}

export const LEADERBOARD_PAGE_SIZE = 50;

function mapLeaderboardRows(
  rows: readonly Record<string, unknown>[],
  offset: number,
): LeaderboardEntry[] {
  return rows.map((r, i) => ({
    id: String(r.id),
    username: String(r.username ?? "Player"),
    coins_earned: Number(r.coins_earned) || 0,
    avatar: normalizeAvatarCrop({
      cardId: r.avatar_card_id ?? null,
      zoom: r.avatar_zoom ?? DEFAULT_AVATAR_CROP.zoom,
      x: r.avatar_x ?? DEFAULT_AVATAR_CROP.x,
      y: r.avatar_y ?? DEFAULT_AVATAR_CROP.y,
    }),
    accentColor: normalizeAccentColor(r.accent_color),
    rank: offset + i + 1,
    badgeIds: normalizeBadgeIds(r.profile_badges),
  }));
}

/** One page of the lifetime Cash board, richest first. */
export async function fetchLeaderboardPage(
  offset = 0,
  opts?: { force?: boolean; limit?: number },
): Promise<LeaderboardEntry[]> {
  const start = Math.max(0, Math.floor(offset));
  const limit = Math.min(
    100,
    Math.max(1, opts?.limit ?? LEADERBOARD_PAGE_SIZE),
  );
  return cached(
    `leaderboard:page:${start}:${limit}`,
    CacheTtl.leaderboard,
    async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, coins_earned, avatar_card_id, avatar_zoom, avatar_x, avatar_y, accent_color, profile_badges(badge_id)",
        )
        .order("coins_earned", { ascending: false })
        .range(start, start + limit - 1);

      if (error) throw new Error(error.message);
      return mapLeaderboardRows((data ?? []) as Record<string, unknown>[], start);
    },
    { force: opts?.force },
  );
}

export async function fetchTopLeaderboard(
  force = false,
): Promise<LeaderboardEntry[]> {
  return fetchLeaderboardPage(0, { force, limit: LEADERBOARD_PAGE_SIZE });
}

export async function fetchLeaderboardRank(
  userId: string,
): Promise<number | null> {
  const id = String(userId ?? "").trim();
  if (!id) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("coins_earned")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const earned = Number(data.coins_earned) || 0;
    const { count, error: countErr } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gt("coins_earned", earned);
    if (countErr) return null;
    return (count ?? 0) + 1;
  } catch {
    return null;
  }
}
