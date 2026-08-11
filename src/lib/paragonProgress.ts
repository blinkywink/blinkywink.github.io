import {
  findParagon,
  maxPathTier,
  paragonCardId,
  type MonkeyCardSpec,
} from "./pathCombos";

export const PARAGON_MIN_DEGREE = 1;
export const PARAGON_MAX_DEGREE = 100;
export const PARAGON_STAGE_EVERY = 20;
export const PARAGON_DUP_DEGREES = 3;

/** Leftover XP toward the next degree. */
export type ParagonState = {
  degree: number;
  xp: number;
};

export type ParagonFeed = {
  paragonId: string;
  xp: number;
  degrees: number;
};

export type ParagonApplyResult = ParagonState & {
  cardId: string;
  xpGained: number;
  degreesGained: number;
};

/**
 * Duplicate XP by max path tier. T0/T1 are crumbs — first degree takes
 * thousands of them. T5s move the bar; a Paragon dupe skips +3 degrees.
 */
export const PARAGON_XP_BY_TIER = [
  1, // T0
  1, // T1
  6, // T2
  22, // T3
  80, // T4
  350, // T5
] as const;

export const PARAGON_STAGE_LABELS = [
  "Awakening",
  "Empowered",
  "Ascendant",
  "Transcendent",
  "Apex",
  "Perfect",
] as const;

export function clampParagonDegree(degree: number): number {
  if (!Number.isFinite(degree)) return PARAGON_MIN_DEGREE;
  return Math.min(
    PARAGON_MAX_DEGREE,
    Math.max(PARAGON_MIN_DEGREE, Math.floor(degree)),
  );
}

export function freshParagonState(): ParagonState {
  return { degree: PARAGON_MIN_DEGREE, xp: 0 };
}

export function normalizeParagonState(
  raw: Partial<ParagonState> | null | undefined,
): ParagonState {
  const degree = clampParagonDegree(Number(raw?.degree ?? PARAGON_MIN_DEGREE));
  if (degree >= PARAGON_MAX_DEGREE) return { degree: PARAGON_MAX_DEGREE, xp: 0 };
  const xp = Math.max(0, Math.floor(Number(raw?.xp ?? 0)));
  return { degree, xp };
}

/** XP needed to go from `degree` → degree+1. Climbs hard toward 100. */
export function xpToNextDegree(degree: number): number {
  const d = clampParagonDegree(degree);
  if (d >= PARAGON_MAX_DEGREE) return 0;
  return Math.round(2400 * d ** 1.18 + 800);
}

/** 0 = deg 1–19 … 5 = deg 100. A new exclusive look every 20 degrees. */
export function paragonStage(degree: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const d = clampParagonDegree(degree);
  if (d >= PARAGON_MAX_DEGREE) return 5;
  return Math.floor((d - 1) / PARAGON_STAGE_EVERY) as 0 | 1 | 2 | 3 | 4;
}

export function paragonStageLabel(degree: number): string {
  return PARAGON_STAGE_LABELS[paragonStage(degree)];
}

/** Suggested Cash ask — higher degree is worth a lot more. */
export function suggestedParagonValue(degree: number): number {
  const d = clampParagonDegree(degree);
  return Math.round(6000 + 120 * d + 18 * d * d);
}

/** XP / degrees this card should feed if the player already has that Paragon. */
export function feedForCard(card: MonkeyCardSpec): ParagonFeed | null {
  if (!findParagon(card.tower)) return null;
  const paragonId = paragonCardId(card.tower);
  if (card.isParagon) {
    return { paragonId, xp: 0, degrees: PARAGON_DUP_DEGREES };
  }
  const tier = maxPathTier(card.pathLevels);
  return {
    paragonId,
    xp: PARAGON_XP_BY_TIER[tier] ?? 1,
    degrees: 0,
  };
}

/** @deprecated use feedForCard — same values, not duplicate-only. */
export function feedForDuplicate(card: MonkeyCardSpec): ParagonFeed | null {
  return feedForCard(card);
}

export function previewParagonFeeds(
  feeds: ParagonFeed[],
  ownedParagonIds: ReadonlySet<string>,
  current: Record<string, ParagonState>,
): { map: Record<string, ParagonState>; results: ParagonApplyResult[] } {
  const merged = new Map<string, { xp: number; degrees: number }>();
  for (const feed of feeds) {
    if (!ownedParagonIds.has(feed.paragonId)) continue;
    const prev = merged.get(feed.paragonId) ?? { xp: 0, degrees: 0 };
    merged.set(feed.paragonId, {
      xp: prev.xp + Math.max(0, feed.xp),
      degrees: prev.degrees + Math.max(0, feed.degrees),
    });
  }
  if (!merged.size) return { map: current, results: [] };

  const next = { ...current };
  const results: ParagonApplyResult[] = [];
  for (const [cardId, gain] of merged) {
    const before = next[cardId] ?? freshParagonState();
    const applied = applyParagonGain(before, gain);
    next[cardId] = applied.next;
    results.push({
      cardId,
      ...applied.next,
      xpGained: gain.xp,
      degreesGained: applied.degreesGained,
    });
  }
  return { map: next, results };
}

export function applyParagonGain(
  state: ParagonState,
  gain: { xp?: number; degrees?: number },
): { next: ParagonState; degreesGained: number } {
  let degree = clampParagonDegree(state.degree);
  let xp = degree >= PARAGON_MAX_DEGREE ? 0 : Math.max(0, state.xp);
  let degreesGained = 0;

  const extraDegrees = Math.max(0, Math.floor(gain.degrees ?? 0));
  if (extraDegrees > 0 && degree < PARAGON_MAX_DEGREE) {
    const raised = Math.min(PARAGON_MAX_DEGREE, degree + extraDegrees);
    degreesGained += raised - degree;
    degree = raised;
    if (degree >= PARAGON_MAX_DEGREE) xp = 0;
  }

  let incoming = Math.max(0, Math.floor(gain.xp ?? 0));
  while (incoming > 0 && degree < PARAGON_MAX_DEGREE) {
    const need = xpToNextDegree(degree);
    const room = Math.max(0, need - xp);
    if (incoming < room) {
      xp += incoming;
      incoming = 0;
      break;
    }
    incoming -= room;
    xp = 0;
    degree += 1;
    degreesGained += 1;
  }

  if (degree >= PARAGON_MAX_DEGREE) {
    return {
      next: { degree: PARAGON_MAX_DEGREE, xp: 0 },
      degreesGained,
    };
  }
  return { next: { degree, xp }, degreesGained };
}

export function mergeParagonStates(
  a: ParagonState,
  b: ParagonState,
): ParagonState {
  const left = normalizeParagonState(a);
  const right = normalizeParagonState(b);
  if (left.degree > right.degree) return left;
  if (right.degree > left.degree) return right;
  return { degree: left.degree, xp: Math.max(left.xp, right.xp) };
}

/** Keep whichever copy is further along — never let a stale fetch wipe XP. */
export function mergeParagonMaps(
  current: Record<string, ParagonState>,
  incoming: Record<string, ParagonState>,
): Record<string, ParagonState> {
  const next: Record<string, ParagonState> = { ...incoming };
  for (const [id, state] of Object.entries(current)) {
    next[id] = next[id] ? mergeParagonStates(next[id], state) : state;
  }
  return next;
}

/** XP / degrees from a raw card id (`ice-monkey-5-0-0`, `ninja-monkey-paragon`). */
export function feedForCardId(cardId: string): ParagonFeed | null {
  const id = String(cardId ?? "").trim();
  if (!id) return null;
  if (id.endsWith("-paragon")) {
    return { paragonId: id, xp: 0, degrees: PARAGON_DUP_DEGREES };
  }
  const m = id.match(/-([0-5])-([0-5])-([0-5])$/);
  if (!m) return null;
  const tier = Math.max(Number(m[1]), Number(m[2]), Number(m[3]));
  return {
    paragonId: id.replace(/-[0-5]-[0-5]-[0-5]$/, "-paragon"),
    xp: PARAGON_XP_BY_TIER[tier] ?? 1,
    degrees: 0,
  };
}

export function formatParagonFeedLine(feed: ParagonFeed): string {
  if (feed.degrees > 0) {
    return `+${feed.degrees} Paragon degree${feed.degrees === 1 ? "" : "s"}`;
  }
  return `+${feed.xp.toLocaleString()} Paragon XP`;
}
