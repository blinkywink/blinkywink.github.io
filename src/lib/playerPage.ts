import { cached, cacheGetStale, CacheTtl } from "./cache";
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

function playerPageKey(username: string): string {
  return `player-page:${String(username ?? "").trim().toLowerCase()}`;
}

export function peekPublicPlayerPage(
  username: string,
): PublicPlayerPage | null | undefined {
  const raw = String(username ?? "").trim();
  if (!raw) return undefined;
  return cacheGetStale<PublicPlayerPage | null>(playerPageKey(raw));
}

async function loadPublicPlayerPage(
  username: string,
): Promise<PublicPlayerPage | null> {
  const profile = await fetchProfileByUsername(username, { force: true });
  if (!profile) return null;

  const [copies, paragons, rank] = await Promise.all([
    fetchPlayerCardCopies(profile.userId, { force: true }),
    fetchPlayerParagons(profile.userId, { force: true }),
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

/** Profile + cards + paragons + rank. Used so the public page never paints empty. */
export async function fetchPublicPlayerPage(
  username: string,
  opts?: {
    force?: boolean;
    revalidate?: boolean;
    onRevalidate?: (page: PublicPlayerPage | null) => void;
  },
): Promise<PublicPlayerPage | null> {
  const raw = String(username ?? "").trim();
  if (!raw) return null;

  return cached(
    playerPageKey(raw),
    CacheTtl.playerCards,
    () => loadPublicPlayerPage(raw),
    {
      force: opts?.force,
      revalidate: opts?.revalidate,
      onRevalidate: opts?.onRevalidate,
    },
  );
}
