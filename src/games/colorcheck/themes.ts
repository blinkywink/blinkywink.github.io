/**
 * Connections themes — mix of:
 * - dumb name patterns you can spot on the tile text
 * - noticeables (art / placement / upgrade type)
 * - light game-knowledge (wiki-accurate lists)
 */
import { towerEntities } from "../../data/towers";
import type { TowerEntity } from "../../data/types";

export type ConnectionDifficulty = 0 | 1 | 2 | 3;

export type ThemeKind = "name" | "notice" | "know";

export type ConnectionTheme = {
  id: string;
  label: string;
  difficulty: ConnectionDifficulty;
  kind: ThemeKind;
  members: TowerEntity[];
};

const POOL = towerEntities.filter((e) => !!e.image);

function words(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

function themeFrom(
  id: string,
  label: string,
  difficulty: ConnectionDifficulty,
  kind: ThemeKind,
  pred: (e: TowerEntity) => boolean,
): ConnectionTheme | null {
  const members = POOL.filter(pred);
  const families = new Set(members.map((e) => e.tower));
  if (families.size < 4) return null;
  return { id, label, difficulty, kind, members };
}

function must(
  id: string,
  label: string,
  difficulty: ConnectionDifficulty,
  kind: ThemeKind,
  pred: (e: TowerEntity) => boolean,
): ConnectionTheme {
  const t = themeFrom(id, label, difficulty, kind, pred);
  if (!t) throw new Error(`Connections theme "${id}" needs ≥4 tower lines`);
  return t;
}

function mustNames(
  id: string,
  label: string,
  difficulty: ConnectionDifficulty,
  kind: ThemeKind,
  names: readonly string[],
): ConnectionTheme {
  const want = new Set(names.map((n) => n.toLowerCase()));
  return must(id, label, difficulty, kind, (e) => want.has(e.name.toLowerCase()));
}

const ABILITY_T4 = [
  "Super Monkey Fan Club",
  "Turbo Charge",
  "MOAB Assassin",
  "Blade Maelstrom",
  "Snowstorm",
  "Glue Strike",
  "Bounty Hunter",
  "Supply Drop",
  "First Strike Capability",
  "Monkey Pirates",
  "Ground Zero",
  "Support Chinook",
  "Artillery Battery",
  "Rocket Storm",
  "Summon Phoenix",
  "Tech Terror",
  "Bloon Sabotage",
  "Transforming Tonic",
  "Jungle's Bounty",
  "Thunder's Decree",
  "Arctic Knight",
  "IMF Loan",
  "Spike Storm",
  "Call to Arms",
  "Overclock",
  "Tyrannosaurus Rex",
] as const;

const CAMO_UNLOCK = [
  "Enhanced Eyesight",
  "Cold Snap",
  "Eagle Eye",
  "Night Vision Goggles",
  "Crow's Nest",
  "Spy Plane",
  "IFR",
  "Increased Accuracy",
  "Advanced Targeting",
  "Monkey Sense",
  "Ultravision",
  "Ball Lightning",
  "Echosense Precision",
  "Zephyr Sense",
  "Radar Scanner",
  "Horned Owl",
] as const;

const DECAMO = [
  "Submerge and Support",
  "Cleansing Foam",
  "Signal Flare",
  "Shimmer",
  "Counter-Espionage",
  "Ice Shards",
  "Alluring Melody",
] as const;

const LEAD_POP = [
  "Full Metal Jacket",
  "Hot Shot",
  "White Hot Spikes",
  "Acidic Mixture Dip",
  "Heat-tipped Darts",
  "Corrosive Glue",
] as const;

const WATER_FAMILIES = new Set([
  "Ice Monkey",
  "Monkey Sub",
  "Monkey Buccaneer",
  "Mermonkey",
]);

const PURPLE_BLOCKED = [
  "Laser Blasts",
  "Plasma Blasts",
  "Sun Avatar",
  "Tech Terror",
  "Ring of Fire",
  "Inferno Ring",
  "Hot Shot",
  "Heart of Thunder",
  "Ball Lightning",
  "Laser Cannon",
  "Plasma Accelerator",
  "Wall of Fire",
  "Dragon's Breath",
  "Fireball",
  "Plasma Monkey Fan Club",
  "Permafrost",
  "Cold Snap",
  "Snowstorm",
  "Absolute Zero",
] as const;

const EXPLOSION = [
  "Bigger Bombs",
  "Heavy Bombs",
  "Really Big Bombs",
  "Frag Bombs",
  "Cluster Bombs",
  "Recursive Cluster",
  "Bomb Blitz",
  "Bloon Impact",
  "The Big One",
  "The Biggest One",
  "Bomber Ace",
  "Tsar Bomba",
  "Missile Launcher",
  "MOAB Mauler",
  "MOAB Assassin",
  "MOAB Eliminator",
  "Ballistic Missile",
  "Flash Bomb",
  "Sticky Bomb",
] as const;

export const CONNECTION_THEMES: ConnectionTheme[] = [
  must(
    "water",
    "Placeable on water",
    0,
    "notice",
    (e) => WATER_FAMILIES.has(e.tower) && e.type !== "tower",
  ),
  must("bases", "Base towers", 0, "notice", (e) => e.type === "tower"),
  must("paragons", "Paragons", 1, "notice", (e) => e.type === "paragon"),

  must(
    "primary-up",
    "Primary Monkeys",
    0,
    "notice",
    (e) => e.category === "Primary" && e.type === "upgrade",
  ),
  must(
    "military-up",
    "Military Monkeys",
    1,
    "notice",
    (e) => e.category === "Military" && e.type === "upgrade",
  ),
  must(
    "magic-up",
    "Magic Monkeys",
    1,
    "notice",
    (e) => e.category === "Magic" && e.type === "upgrade",
  ),
  must(
    "support-up",
    "Support Monkeys",
    2,
    "notice",
    (e) => e.category === "Support" && e.type === "upgrade",
  ),

  must("moab-name", "MOAB in the name", 0, "name", (e) => /moab/i.test(e.name)),
  must(
    "starts-the",
    'Starts with "The"',
    0,
    "name",
    (e) => /^The\b/i.test(e.name),
  ),
  must(
    "lord-master",
    "Lord or Master in the name",
    1,
    "name",
    (e) => /\b(lord|master)\b/i.test(e.name),
  ),
  must(
    "bloon-name",
    "Bloon in the name",
    1,
    "name",
    (e) => /\bbloons?\b/i.test(e.name),
  ),
  must("one-word", "One-word name", 2, "name", (e) => words(e.name).length === 1),
  must("hyphen", "Hyphen in the name", 2, "name", (e) => e.name.includes("-")),
  must(
    "apostrophe",
    "Apostrophe in the name",
    2,
    "name",
    (e) => /['']/.test(e.name),
  ),
  must(
    "contains-of",
    'Has "of" in the name',
    2,
    "name",
    (e) => /\bof\b/i.test(e.name),
  ),
  must("alliteration", "Alliteration (first two words)", 3, "name", (e) => {
    const w = words(e.name);
    if (w.length < 2) return false;
    return w[0]![0]!.toLowerCase() === w[1]![0]!.toLowerCase();
  }),
  must(
    "four-plus-words",
    "Four or more words",
    3,
    "name",
    (e) => words(e.name).length >= 4,
  ),

  mustNames("ability-t4", "Activated abilities", 1, "know", ABILITY_T4),
  mustNames("camo-unlock", "Unlock camo detection", 2, "know", CAMO_UNLOCK),
  mustNames(
    "purple-blocked",
    "Can't pop Purples (no MIB)",
    2,
    "know",
    PURPLE_BLOCKED,
  ),
  mustNames(
    "explosion-black",
    "Explosion damage (Black immune)",
    3,
    "know",
    EXPLOSION,
  ),
  mustNames("lead-pop", "Grant lead popping", 3, "know", LEAD_POP),
  mustNames("decamo", "Remove camo from bloons", 3, "know", DECAMO),
];

/** Occasional letter fillers. Pass `rnd` for deterministic dailies. */
export function randomStartsWithThemes(
  count: number,
  rnd: () => number = Math.random,
): ConnectionTheme[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = letters[i]!;
    letters[i] = letters[j]!;
    letters[j] = tmp;
  }
  const out: ConnectionTheme[] = [];
  const diffs: ConnectionDifficulty[] = [0, 1, 2, 3];
  for (const letter of letters) {
    if (out.length >= count) break;
    const t = themeFrom(
      `starts-${letter}`,
      `Starts with ${letter}`,
      diffs[out.length % diffs.length]!,
      "name",
      (e) => e.name.toUpperCase().startsWith(letter),
    );
    if (t) out.push(t);
  }
  return out;
}
