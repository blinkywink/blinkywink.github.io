import type { TowerEntity } from "../data/types";

/** Common shorthand players type instead of full tower names. */
const TOWER_ALIASES: Record<string, string[]> = {
  sniper: ["sniper monkey"],
  dart: ["dart monkey"],
  boomer: ["boomerang monkey"],
  boomerang: ["boomerang monkey"],
  bomb: ["bomb shooter"],
  tack: ["tack shooter"],
  ice: ["ice monkey"],
  glue: ["glue gunner"],
  sub: ["monkey sub"],
  bucc: ["monkey buccaneer"],
  boat: ["monkey buccaneer"],
  ace: ["monkey ace"],
  heli: ["heli pilot"],
  mortar: ["mortar monkey"],
  dartling: ["dartling gunner"],
  wizard: ["wizard monkey"],
  wiz: ["wizard monkey"],
  ninja: ["ninja monkey"],
  alch: ["alchemist"],
  druid: ["druid"],
  super: ["super monkey"],
  farm: ["banana farm"],
  banana: ["banana farm"],
  spactory: ["spike factory"],
  spike: ["spike factory"],
  village: ["monkey village"],
  engi: ["engineer monkey"],
  engineer: ["engineer monkey"],
  beast: ["beast handler"],
  mer: ["mermonkey"],
  merm: ["mermonkey"],
  desperado: ["desperado"],
  sky: ["skywarden"],
  warden: ["skywarden"],
  archer: ["skywarden"],
  skywarden: ["skywarden"],
};

export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type PathHit = { path: number; tier: number };

/**
 * Parse BTD-style path codes from a query.
 * Supports: x3x, x 3 x, 0-3-0, 030, 3xx, xx5, 2/0/3, etc.
 */
export function extractPathCode(raw: string): {
  hits: PathHit[];
  rest: string;
} {
  const patterns: RegExp[] = [
    // spaced / dashed / slashed triplets with digits or x
    /\b([0-5x])\s*[-/]\s*([0-5x])\s*[-/]\s*([0-5x])\b/i,
    /\b([0-5x])\s+([0-5x])\s+([0-5x])\b/i,
    // compact triplets (x3x, 030, 3xx, xx5, 203)
    /\b([0-5x]{3})\b/i,
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (!m) continue;

    let a: string;
    let b: string;
    let c: string;
    if (m.length >= 4 && m[2] != null && m[3] != null) {
      a = m[1];
      b = m[2];
      c = m[3];
    } else {
      const compact = m[1];
      if (compact.length !== 3) continue;
      a = compact[0];
      b = compact[1];
      c = compact[2];
    }

    const vals = [a, b, c].map((v) =>
      v.toLowerCase() === "x" ? 0 : Number.parseInt(v, 10),
    );
    if (vals.some((n) => Number.isNaN(n) || n < 0 || n > 5)) continue;

    const hits: PathHit[] = [];
    for (let i = 0; i < 3; i++) {
      if (vals[i]! > 0) hits.push({ path: i + 1, tier: vals[i]! });
    }
    if (hits.length === 0) continue;

    const rest = `${raw.slice(0, m.index)}${raw.slice((m.index ?? 0) + m[0].length)}`;
    return { hits, rest };
  }

  return { hits: [], rest: raw };
}

function towerMatchesText(towerName: string, text: string): boolean {
  const tower = normalizeSearch(towerName);
  const q = normalizeSearch(text);
  if (!q) return true;
  if (tower.includes(q) || q.includes(tower)) return true;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => tower.includes(t))) return true;

  for (const token of tokens) {
    const aliases = TOWER_ALIASES[token];
    if (!aliases) continue;
    if (aliases.some((alias) => tower.includes(normalizeSearch(alias)))) {
      // remaining tokens (excluding this alias) should still match
      const others = tokens.filter((t) => t !== token);
      if (others.every((t) => tower.includes(t))) return true;
    }
  }

  // Whole-query alias: "sniper"
  const wholeAlias = TOWER_ALIASES[q];
  if (wholeAlias?.some((alias) => tower.includes(normalizeSearch(alias)))) {
    return true;
  }

  return false;
}

function nameRank(query: string, entity: TowerEntity): number {
  const q = normalizeSearch(query);
  if (!q) return -1;
  const name = normalizeSearch(entity.name);

  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (name.includes(q)) return 70;

  if (towerMatchesText(entity.tower, q)) {
    if (entity.type === "tower") return 55;
    return 40;
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => name.includes(t))) return 60;
  return -1;
}

/**
 * Rank how well an entity matches a free-text / path-code search.
 * Returns -1 if it should not appear.
 */
export function rankEntityMatch(rawQuery: string, entity: TowerEntity): number {
  const { hits, rest } = extractPathCode(rawQuery);
  const text = rest.trim();

  if (hits.length > 0) {
    if (entity.type === "tower" || entity.path == null || entity.tier <= 0) {
      return -1;
    }
    const pathOk = hits.some(
      (h) => h.path === entity.path && h.tier === entity.tier,
    );
    if (!pathOk) return -1;
    if (text && !towerMatchesText(entity.tower, text)) return -1;

    // Prefer exact single-path codes (x3x) slightly over multi-digit crosspaths
    const specificity = hits.length === 1 ? 20 : 0;
    return 95 + specificity;
  }

  return nameRank(rawQuery, entity);
}
