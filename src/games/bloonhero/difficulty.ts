export type Difficulty = "easy" | "normal" | "hard";

export type ChartNoteLike = {
  t: number;
  midi: number;
  dur: number;
  vel: number;
  lane: number;
};

export const DIFFICULTY_META: Record<
  Difficulty,
  {
    label: string;
    blurb: string;
    /** Global min spacing between kept notes (s). */
    minGap: number;
    /** Per-lane min spacing (s). */
    laneGap: number;
    /** Max simultaneous chord size. */
    maxChord: number;
    lives: number;
    cashMul: number;
    clearBonusMul: number;
    windowScale: number;
  }
> = {
  easy: {
    label: "Easy",
    blurb: "Sparse melody, bigger windows",
    minGap: 0.44,
    laneGap: 0.5,
    maxChord: 1,
    lives: 5,
    cashMul: 1,
    clearBonusMul: 1,
    windowScale: 1.35,
  },
  normal: {
    label: "Normal",
    blurb: "Readable Guitar Hero pace",
    minGap: 0.28,
    laneGap: 0.32,
    maxChord: 1,
    lives: 4,
    cashMul: 1.6,
    clearBonusMul: 1.5,
    windowScale: 1.1,
  },
  hard: {
    label: "Hard",
    blurb: "Dense runs, bigger payout",
    minGap: 0.15,
    laneGap: 0.17,
    maxChord: 2,
    lives: 3,
    cashMul: 2.4,
    clearBonusMul: 2.2,
    windowScale: 1,
  },
};

/**
 * Thin a full MIDI melody chart into a playable set for the chosen difficulty.
 * Prefers longer notes and wider pitch jumps so the groove still reads.
 */
export function thinChart<T extends ChartNoteLike>(
  notes: readonly T[],
  diff: Difficulty,
): T[] {
  const meta = DIFFICULTY_META[diff];
  const sorted = [...notes].sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    if (b.dur !== a.dur) return b.dur - a.dur;
    return b.midi - a.midi;
  });

  const kept: T[] = [];
  const lastLane = [-Infinity, -Infinity, -Infinity, -Infinity];
  let lastGlobal = -Infinity;
  let chordAt = -Infinity;
  let chordSize = 0;

  for (const n of sorted) {
    const sameInstant = Math.abs(n.t - chordAt) < 0.04;
    if (sameInstant) {
      if (chordSize >= meta.maxChord) continue;
    } else {
      if (n.t - lastGlobal < meta.minGap * 0.72) continue;
      chordAt = n.t;
      chordSize = 0;
    }

    if (n.t - lastLane[n.lane]! < meta.laneGap) continue;

    kept.push(n);
    lastLane[n.lane] = n.t;
    lastGlobal = n.t;
    chordSize += 1;
  }

  return kept;
}
