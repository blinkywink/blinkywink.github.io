import cardAccents from "../data/cardAccents.json";
import { towers } from "../data/towers";
import type { TowerEntity } from "../data/types";
import { towerIdSlug } from "./pathCombos";

export const PACK_SIZE = 10;
export const BTD6_PACK_ART = "/images/ui/monkey-pack.jpg";

export const CATEGORY_ORDER = [
  "Primary",
  "Military",
  "Magic",
  "Support",
] as const;

export type TowerCategory = (typeof CATEGORY_ORDER)[number];

type Accent = {
  primary: string;
  secondary: string;
  colors: string[];
  rgb?: [number, number, number];
  icon: string | null;
};

const accents = cardAccents as unknown as Record<string, Accent>;

export const CATEGORY_INK: Record<string, string> = {
  Primary: "#f0b429",
  Military: "#6ecf5a",
  Magic: "#c084fc",
  Support: "#60a5fa",
};

export type PackKind = "btd6" | "tower" | "category";

export type PackDef = {
  id: string;
  kind: PackKind;
  /** Display title on the pack / store. */
  title: string;
  subtitle: string;
  /** null = all towers / category pack */
  tower: string | null;
  /** Set for category packs */
  category?: TowerCategory | null;
  cardCount: number;
  /** Only for kind === "btd6" — painted cover art */
  coverArt?: string;
};

export type TowerPackTheme = {
  tower: string;
  category: string;
  slug: string;
  title: string;
  shortTitle: string;
  image: string;
  icon: string | null;
  primary: string;
  secondary: string;
  tertiary: string;
  categoryInk: string;
  rgb: [number, number, number];
};

export type CategoryPackTheme = {
  category: TowerCategory;
  title: string;
  ink: string;
  primary: string;
  secondary: string;
  images: string[];
};

export const PACK_PRICES = {
  btd6: 1000,
  tower: 1500,
  category: 1200,
} as const;

export function btd6Pack(): PackDef {
  return {
    id: "btd6",
    kind: "btd6",
    title: "BTD6",
    subtitle: "ALL TOWERS",
    tower: null,
    category: null,
    cardCount: PACK_SIZE,
    coverArt: BTD6_PACK_ART,
  };
}

/** Cash price in the shop. */
export function packPrice(pack: PackDef): number {
  return PACK_PRICES[pack.kind];
}

export function towerPack(towerName: string): PackDef {
  const base = towers.find((t) => t.name === towerName);
  const short = shortTowerName(towerName);
  return {
    id: `tower-${towerIdSlug(towerName)}`,
    kind: "tower",
    title: short.toUpperCase(),
    subtitle: `${base?.category ?? "TOWER"} PACK`,
    tower: towerName,
    category: null,
    cardCount: PACK_SIZE,
  };
}

function allTowerPacks(
  excludeTowers: ReadonlySet<string> = new Set(),
): PackDef[] {
  return towers
    .filter((t) => !excludeTowers.has(t.name))
    .map((t) => towerPack(t.name));
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Random tower pack (duplicates convert to Cash if already owned). */
export function pickRewardTowerPack(
  _owned?: ReadonlySet<string>,
  excludeTowers?: ReadonlySet<string>,
): PackDef | null {
  const bag = shuffleInPlace(allTowerPacks(excludeTowers));
  return bag[0] ?? null;
}

/** Up to `count` random tower packs (for bonus pick-one). */
export function pickRewardTowerPackChoices(
  _owned?: ReadonlySet<string>,
  count = 3,
  excludeTowers?: ReadonlySet<string>,
): PackDef[] {
  return shuffleInPlace(allTowerPacks(excludeTowers)).slice(0, count);
}

export function categoryPack(category: TowerCategory): PackDef {
  return {
    id: `category-${category.toLowerCase()}`,
    kind: "category",
    title: category.toUpperCase(),
    subtitle: "CATEGORY PACK",
    tower: null,
    category,
    cardCount: PACK_SIZE,
  };
}

export function allCategoryPacks(): PackDef[] {
  return CATEGORY_ORDER.map(categoryPack);
}

/** Featured shop row: BTD6 + 3 rotating tower packs. */
export function featuredShopPacks(dayKey = dayStamp()): PackDef[] {
  return [btd6Pack(), ...dailyTowerPicks(3, dayKey).map(towerPack)];
}

export function shortTowerName(tower: string): string {
  return tower
    .replace(/\s+Monkey$/i, "")
    .replace(/^Monkey\s+/i, "")
    .trim();
}

export function towersInCategory(category: string): TowerEntity[] {
  return towers.filter((t) => t.category === category);
}

export function resolveTowerPackTheme(towerName: string): TowerPackTheme | null {
  const base = towers.find((t) => t.name === towerName) as TowerEntity | undefined;
  if (!base) return null;

  const accent = accents[base.id];
  const primary = accent?.primary ?? "#2f9fe0";
  const secondary = accent?.secondary ?? "#ffd23f";
  const tertiary = accent?.colors?.[2] ?? secondary;
  const rgb = accent?.rgb ?? ([47, 159, 224] as [number, number, number]);
  const short = shortTowerName(towerName);

  return {
    tower: towerName,
    category: base.category,
    slug: towerIdSlug(towerName),
    title: short.toUpperCase(),
    shortTitle: short,
    image: base.image,
    icon: accent?.icon ?? null,
    primary,
    secondary,
    tertiary,
    categoryInk: CATEGORY_INK[base.category] ?? "#ffd23f",
    rgb,
  };
}

export function resolveCategoryPackTheme(
  category: TowerCategory,
): CategoryPackTheme {
  const members = towersInCategory(category);
  const ink = CATEGORY_INK[category] ?? "#ffd23f";
  // Spread a few faces: first, middle, last for variety
  const images: string[] = [];
  if (members.length) {
    images.push(members[0]!.image);
    if (members.length > 2) {
      images.push(members[Math.floor(members.length / 2)]!.image);
    }
    if (members.length > 1) {
      images.push(members[members.length - 1]!.image);
    }
  }
  return {
    category,
    title: category.toUpperCase(),
    ink,
    primary: ink,
    secondary: "#e8e8f0",
    images,
  };
}

/** Deterministic “daily” tower picks (for store shelf later). */
export function dailyTowerPicks(count = 3, dayKey = dayStamp()): string[] {
  const names = towers.map((t) => t.name);
  if (!names.length) return [];
  let seed = hashString(dayKey);
  const bag = [...names];
  const out: string[] = [];
  while (out.length < count && bag.length) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const idx = seed % bag.length;
    out.push(bag.splice(idx, 1)[0]!);
  }
  return out;
}

export function dayStamp(d = new Date()): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/** Next UTC midnight (ms since epoch) — when featured tower packs rotate. */
export function nextUtcMidnightMs(now = new Date()): number {
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
}

export function msUntilShopRotation(now = new Date()): number {
  return Math.max(0, nextUtcMidnightMs(now) - now.getTime());
}

/** e.g. "4h 12m" / "12m 05s" / "45s" */
export function formatShopCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
