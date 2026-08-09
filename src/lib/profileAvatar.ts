import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "./avatar";

export async function setProfileAvatar(crop: AvatarCrop): Promise<void> {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to set a profile picture.");
  }
  const next = normalizeAvatarCrop(crop);
  const { error } = await supabase.rpc("set_profile_avatar", {
    p_card_id: next.cardId,
    p_zoom: next.zoom,
    p_x: next.x,
    p_y: next.y,
  });
  if (error) throw new Error(error.message);
}

export function avatarFromProfile(row: {
  avatar_card_id?: string | null;
  avatar_zoom?: number | null;
  avatar_x?: number | null;
  avatar_y?: number | null;
}): AvatarCrop {
  return normalizeAvatarCrop({
    cardId: row.avatar_card_id ?? null,
    zoom: row.avatar_zoom ?? DEFAULT_AVATAR_CROP.zoom,
    x: row.avatar_x ?? DEFAULT_AVATAR_CROP.x,
    y: row.avatar_y ?? DEFAULT_AVATAR_CROP.y,
  });
}
