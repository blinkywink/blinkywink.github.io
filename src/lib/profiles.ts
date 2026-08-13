import { supabase } from "./supabase";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "./avatar";
import { cached, CacheTtl } from "./cache";
import { normalizeAccentColor } from "./profileCosmetics";
import {
  normalizeHeroLevels,
  normalizeOwnedHeroIds,
} from "./profileHeroes";
import { normalizeBadgeIds } from "./profileBadges";
import { normalizeShowcaseIds } from "./profileShowcase";

export type PublicProfile = {
  userId: string;
  username: string;
  avatar: AvatarCrop;
  showcaseCardIds: string[];
  accentColor: string | null;
  ownedHeroIds: string[];
  equippedHeroId: string | null;
  heroLevels: Record<string, number>;
  badgeIds: string[];
};

export type ProfileSearchHit = {
  userId: string;
  username: string;
  coinsEarned: number;
  avatar: AvatarCrop;
  accentColor: string | null;
  badgeIds: string[];
};

function escapeIlike(raw: string): string {
  // Strip LIKE wildcards from user input (PostgREST has no ESCAPE clause).
  return raw.replace(/[%_]/g, "");
}

/** Look up a profile by username (case-insensitive). */
export async function fetchProfileByUsername(
  username: string,
): Promise<PublicProfile | null> {
  const raw = String(username ?? "").trim();
  if (!raw) return null;

  const key = `profile:name:${raw.toLowerCase()}`;
  return cached(key, CacheTtl.profiles, async () => {
    const { data, error } = await supabase.rpc("get_profile_by_username", {
      p_username: raw,
    });

    if (error) {
      console.warn("profile lookup failed", error.message);
      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;

    return {
      userId: String(row.id),
      username: String(row.username ?? raw),
      avatar: normalizeAvatarCrop({
        cardId: row.avatar_card_id ?? null,
        zoom: row.avatar_zoom ?? DEFAULT_AVATAR_CROP.zoom,
        x: row.avatar_x ?? DEFAULT_AVATAR_CROP.x,
        y: row.avatar_y ?? DEFAULT_AVATAR_CROP.y,
      }),
      showcaseCardIds: normalizeShowcaseIds(row.showcase_card_ids),
      accentColor: normalizeAccentColor(row.accent_color),
      ownedHeroIds: normalizeOwnedHeroIds(row.owned_hero_ids),
      equippedHeroId: row.equipped_hero_id
        ? String(row.equipped_hero_id)
        : null,
      heroLevels: normalizeHeroLevels(row.hero_levels),
      badgeIds: normalizeBadgeIds(row.badge_ids),
    };
  });
}

/** Partial username search (case-insensitive), richest players first. */
export async function searchProfilesByUsername(
  query: string,
  limit = 50,
): Promise<ProfileSearchHit[]> {
  const raw = String(query ?? "").trim();
  if (raw.length < 2) return [];

  const pattern = `%${escapeIlike(raw)}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, coins_earned, avatar_card_id, avatar_zoom, avatar_x, avatar_y, accent_color, profile_badges(badge_id)",
    )
    .ilike("username", pattern)
    .order("coins_earned", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));

  if (error) {
    console.warn("profile search failed", error.message);
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    userId: String(row.id),
    username: String(row.username ?? "Player"),
    coinsEarned: Number(row.coins_earned) || 0,
    avatar: normalizeAvatarCrop({
      cardId: row.avatar_card_id ?? null,
      zoom: row.avatar_zoom ?? DEFAULT_AVATAR_CROP.zoom,
      x: row.avatar_x ?? DEFAULT_AVATAR_CROP.x,
      y: row.avatar_y ?? DEFAULT_AVATAR_CROP.y,
    }),
    accentColor: normalizeAccentColor(row.accent_color),
    badgeIds: normalizeBadgeIds(
      (row as { profile_badges?: unknown }).profile_badges,
    ),
  }));
}
