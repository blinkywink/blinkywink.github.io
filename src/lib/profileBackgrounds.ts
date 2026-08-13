/** Purchasable profile / collection page backgrounds. */

export const PROFILE_BG_COST = 40_000;
export const PROFILE_BG_CHANGE_COST = 1_500;

export type ProfileBackground = {
  id: string;
  name: string;
  /** Public image path. */
  src: string;
};

/** Curated map arts — enough variety without dumping the whole atlas. */
export const PROFILE_BACKGROUNDS: ProfileBackground[] = [
  {
    id: "monkey-meadow",
    name: "Monkey Meadow",
    src: "/images/maps/monkey-meadow.webp",
  },
  {
    id: "dark-castle",
    name: "Dark Castle",
    src: "/images/maps/dark-castle.webp",
  },
  {
    id: "infernal",
    name: "Infernal",
    src: "/images/maps/infernal.webp",
  },
  {
    id: "frozen-over",
    name: "Frozen Over",
    src: "/images/maps/frozen-over.webp",
  },
  {
    id: "enchanted-glade",
    name: "Enchanted Glade",
    src: "/images/maps/enchanted-glade.webp",
  },
  {
    id: "high-finance",
    name: "High Finance",
    src: "/images/maps/high-finance.webp",
  },
  {
    id: "haunted",
    name: "Haunted",
    src: "/images/maps/haunted.webp",
  },
  {
    id: "bloonarius-prime",
    name: "Bloonarius Prime",
    src: "/images/maps/bloonarius-prime.webp",
  },
];

export function profileBackgroundById(
  id: string | null | undefined,
): ProfileBackground | null {
  const key = String(id ?? "").trim().toLowerCase();
  if (!key) return null;
  return PROFILE_BACKGROUNDS.find((b) => b.id === key) ?? null;
}

export function normalizeBackgroundId(raw: unknown): string | null {
  const bg = profileBackgroundById(String(raw ?? ""));
  return bg?.id ?? null;
}
