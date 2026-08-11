import { fetchPlayerCardCopies } from "./awardCards";
import { fetchLeaderboardRank } from "./leaderboardRanks";
import { fetchPlayerParagons } from "./paragonApi";
import type { ParagonMap } from "./guestParagons";
import { fetchProfileByUsername, type PublicProfile } from "./profiles";

export type PublicPlayerPage = {
  profile: PublicProfile;
  ownedIds: string[];
  seeds: Record<string, number>;
  paragons: ParagonMap;
  rank: number | null;
};

/** Profile + cards + paragons + rank. Used so the public page never paints empty. */
export async function fetchPublicPlayerPage(
  username: string,
): Promise<PublicPlayerPage | null> {
  const profile = await fetchProfileByUsername(username);
  if (!profile) return null;

  const [copies, paragons, rank] = await Promise.all([
    fetchPlayerCardCopies(profile.userId),
    fetchPlayerParagons(profile.userId),
    fetchLeaderboardRank(profile.userId),
  ]);

  return {
    profile,
    ownedIds: copies.map((row) => row.cardId),
    seeds: Object.fromEntries(
      copies
        .filter((row) => row.visualSeed != null)
        .map((row) => [row.cardId, row.visualSeed as number]),
    ),
    paragons,
    rank,
  };
}
