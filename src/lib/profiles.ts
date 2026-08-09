import { supabase } from "./supabase";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "./avatar";
import { cached, CacheTtl } from "./cache";

export type PublicProfile = {
  userId: string;
  username: string;
  avatar: AvatarCrop;
};

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
    };
  });
}
