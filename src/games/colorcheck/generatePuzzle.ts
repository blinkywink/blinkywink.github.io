import { towerEntities } from "../../data/towers";
import type { TowerEntity } from "../../data/types";
import {
  CONNECTION_THEMES,
  randomStartsWithThemes,
  type ConnectionDifficulty,
  type ConnectionTheme,
  type ThemeKind,
} from "./themes";

export type { ConnectionDifficulty };

export type ConnectionGroup = {
  id: string;
  label: string;
  difficulty: ConnectionDifficulty;
  entityIds: string[];
};

export type ConnectionPuzzle = {
  id: string;
  groups: ConnectionGroup[];
  board: TowerEntity[];
};

const DIFF_ORDER: ConnectionDifficulty[] = [0, 1, 2, 3];

function hashDay(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

function pickFour(
  theme: ConnectionTheme,
  used: Set<string>,
  rnd: () => number,
): TowerEntity[] | null {
  const pool = shuffle(
    theme.members.filter((e) => !used.has(e.id) && !!e.image),
    rnd,
  );
  const byFam = new Map<string, TowerEntity[]>();
  for (const e of pool) {
    const list = byFam.get(e.tower) ?? [];
    list.push(e);
    byFam.set(e.tower, list);
  }
  const fams = shuffle([...byFam.keys()], rnd);
  if (fams.length < 4) return null;
  return fams.slice(0, 4).map((fam) => {
    const opts = byFam.get(fam)!;
    return opts[Math.floor(rnd() * opts.length)]!;
  });
}

function themePoolForAttempt(rnd: () => number): ConnectionTheme[] {
  return [...CONNECTION_THEMES, ...randomStartsWithThemes(2, rnd)];
}

function buildPuzzle(seed: number, id: string): ConnectionPuzzle {
  const rnd = mulberry32(seed);
  const all = towerEntities.filter((e) => !!e.image);

  for (let attempt = 0; attempt < 80; attempt++) {
    const attemptRnd = mulberry32((seed + attempt * 9973) >>> 0);
    const pool = themePoolForAttempt(attemptRnd);
    const used = new Set<string>();
    const usedThemeIds = new Set<string>();
    const usedKinds: ThemeKind[] = [];
    const groups: ConnectionGroup[] = [];

    const byDiff = new Map<ConnectionDifficulty, ConnectionTheme[]>();
    for (const d of DIFF_ORDER) byDiff.set(d, []);
    for (const t of shuffle(pool, attemptRnd)) {
      byDiff.get(t.difficulty)!.push(t);
    }

    let ok = true;
    for (const d of DIFF_ORDER) {
      const nameCount = usedKinds.filter((k) => k === "name").length;
      const candidates = shuffle(byDiff.get(d) ?? [], attemptRnd).filter(
        (theme) => {
          if (usedThemeIds.has(theme.id)) return false;
          if (theme.kind === "name" && nameCount >= 2) return false;
          return true;
        },
      );

      let built: ConnectionGroup | null = null;
      let builtKind: ThemeKind | null = null;

      for (const theme of candidates) {
        const pick = pickFour(theme, used, attemptRnd);
        if (!pick) continue;
        usedThemeIds.add(theme.id);
        builtKind = theme.kind;
        built = {
          id: `${theme.id}-${d}`,
          label: theme.label,
          difficulty: d,
          entityIds: pick.map((e) => e.id),
        };
        break;
      }

      if (!built) {
        for (const theme of shuffle(pool, attemptRnd)) {
          if (usedThemeIds.has(theme.id)) continue;
          const pick = pickFour(theme, used, attemptRnd);
          if (!pick) continue;
          usedThemeIds.add(theme.id);
          builtKind = theme.kind;
          built = {
            id: `${theme.id}-${d}`,
            label: theme.label,
            difficulty: d,
            entityIds: pick.map((e) => e.id),
          };
          break;
        }
      }

      if (!built || !builtKind) {
        ok = false;
        break;
      }
      usedKinds.push(builtKind);
      for (const id of built.entityIds) used.add(id);
      groups.push(built);
    }

    if (!ok || groups.length !== 4) continue;

    const ids = groups.flatMap((g) => g.entityIds);
    if (new Set(ids).size !== 16) continue;

    const badFamily = groups.some((g) => {
      const fams = g.entityIds.map((id) => all.find((e) => e.id === id)?.tower);
      return new Set(fams).size < 4;
    });
    if (badFamily) continue;

    const kindSet = new Set(usedKinds);
    if (kindSet.size < 2 && attempt < 50) continue;

    const board = shuffle(
      ids.map((id) => all.find((e) => e.id === id)!).filter(Boolean),
      attemptRnd,
    );
    if (board.length !== 16) continue;
    return { id, groups, board };
  }

  const used = new Set<string>();
  const groups: ConnectionGroup[] = [];
  for (const theme of CONNECTION_THEMES) {
    if (groups.length >= 4) break;
    const pick = pickFour(theme, used, rnd);
    if (!pick) continue;
    for (const e of pick) used.add(e.id);
    groups.push({
      id: `fallback-${theme.id}`,
      label: theme.label,
      difficulty: groups.length as ConnectionDifficulty,
      entityIds: pick.map((e) => e.id),
    });
  }
  const board = shuffle(
    groups.flatMap((g) =>
      g.entityIds.map((id) => all.find((e) => e.id === id)!),
    ),
    rnd,
  );
  return { id, groups, board };
}

/** Same UTC day → same board for everyone. */
export function dailyPuzzle(dayKey: string): ConnectionPuzzle {
  const seed = hashDay(`connections-daily-v1-${dayKey}`);
  return buildPuzzle(seed, `conn-daily-${dayKey}`);
}

export function practicePuzzle(salt = Date.now()): ConnectionPuzzle {
  const seed = (hashDay(`connections-practice-v1-${salt}`) ^ salt) >>> 0;
  return buildPuzzle(seed, `conn-practice-${seed}`);
}

/** @deprecated use dailyPuzzle / practicePuzzle */
export function generateConnectionPuzzle(): ConnectionPuzzle {
  return practicePuzzle();
}

export function entityById(id: string): TowerEntity | undefined {
  return towerEntities.find((e) => e.id === id);
}

export function reconstructBoard(ids: string[]): TowerEntity[] {
  return ids
    .map((id) => towerEntities.find((e) => e.id === id))
    .filter(Boolean) as TowerEntity[];
}
