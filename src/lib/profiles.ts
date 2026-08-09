import { supabase } from "./supabase";

export type PublicProfile = {
  userId: string;
  username: string;
};

/** Look up a profile by username (case-insensitive). */
export async function fetchProfileByUsername(
  username: string,
): Promise<PublicProfile | null> {
  const raw = String(username ?? "").trim();
  if (!raw) return null;

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
  };
}
