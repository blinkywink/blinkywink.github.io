import { supabase } from "./supabase";

export const EARLY_SUPPORTER_BADGE = "early_supporter";

export type ProfileBadgeDef = {
  id: string;
  src: string;
  label: string;
};

export const PROFILE_BADGES: Record<string, ProfileBadgeDef> = {
  [EARLY_SUPPORTER_BADGE]: {
    id: EARLY_SUPPORTER_BADGE,
    src: "/images/ui/medals/early-supporter.webp",
    label: "Early Supporter — Playtested the game in beta",
  },
};

export function normalizeBadgeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const next: string[] = [];
  for (const item of raw) {
    const id =
      typeof item === "string"
        ? item
        : item && typeof item === "object" && "badge_id" in item
          ? String((item as { badge_id: unknown }).badge_id ?? "")
          : "";
    if (id && PROFILE_BADGES[id] && !next.includes(id)) next.push(id);
  }
  return next;
}

export function badgesFromIds(ids: readonly string[] | null | undefined) {
  return (ids ?? [])
    .map((id) => PROFILE_BADGES[id])
    .filter((b): b is ProfileBadgeDef => Boolean(b));
}

export async function fetchBadgeIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("profile_badges")
    .select("badge_id")
    .eq("user_id", userId);
  if (error) {
    console.warn("badge lookup failed", error.message);
    return [];
  }
  return normalizeBadgeIds(data);
}
