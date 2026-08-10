/**
 * Minimal Clone Hero / Moonscraper `.chart` parser.
 * Frets 0–4 map to lanes D F J K L (guitar, bass, and drums treated the same).
 */

import {
  CHART_TRACK_NAMES,
  type PlayableInstrument,
  PLAYABLE_INSTRUMENTS,
} from "./instruments";

export type ChartNote = {
  t: number;
  lane: number;
  /** Sustain length in seconds; 0 for taps. */
  dur: number;
  tick: number;
  sustain: boolean;
};

/** Shorter than this is treated as a tap (no trail / hold). */
export const MIN_SUSTAIN_S = 0.14;

export type ParsedChart = {
  name: string;
  artist: string;
  resolution: number;
  offsetSec: number;
  notes: ChartNote[];
  duration: number;
  instrument: PlayableInstrument;
};

type TempoEvent = { tick: number; bpm: number };

function parseBlock(text: string, name: string): string[] {
  const re = new RegExp(`\\[${name}\\]\\s*\\{([\\s\\S]*?)\\}`, "i");
  const m = text.match(re);
  if (!m?.[1]) return [];
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
}

function parseSongMeta(text: string): {
  name: string;
  artist: string;
  resolution: number;
  offsetSec: number;
} {
  const lines = parseBlock(text, "Song");
  let name = "Unknown";
  let artist = "Unknown";
  let resolution = 192;
  let offsetSec = 0;
  for (const line of lines) {
    const m = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    let val = m[2]!.trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (key === "name") name = val;
    if (key === "artist") artist = val;
    if (key === "resolution") resolution = Number(val) || 192;
    if (key === "offset") offsetSec = Number(val) || 0;
  }
  return { name, artist, resolution, offsetSec };
}

function parseTempos(text: string): TempoEvent[] {
  const lines = parseBlock(text, "SyncTrack");
  const tempos: TempoEvent[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*=\s*B\s+(\d+)/i);
    if (!m) continue;
    tempos.push({ tick: Number(m[1]), bpm: Number(m[2]) / 1000 });
  }
  if (!tempos.length) tempos.push({ tick: 0, bpm: 120 });
  tempos.sort((a, b) => a.tick - b.tick);
  if (tempos[0]!.tick !== 0) tempos.unshift({ tick: 0, bpm: tempos[0]!.bpm });
  return tempos;
}

function tickToSeconds(
  tick: number,
  resolution: number,
  tempos: TempoEvent[],
): number {
  let time = 0;
  let prevTick = 0;
  let bpm = tempos[0]?.bpm ?? 120;
  for (const ev of tempos) {
    if (ev.tick > tick) break;
    if (ev.tick > prevTick) {
      time += ((ev.tick - prevTick) / resolution) * (60 / bpm);
      prevTick = ev.tick;
    }
    bpm = ev.bpm;
  }
  if (tick > prevTick) {
    time += ((tick - prevTick) / resolution) * (60 / bpm);
  }
  return time;
}

function pickTrackBlock(
  text: string,
  instrument: PlayableInstrument,
): string[] {
  const suffixes = CHART_TRACK_NAMES[instrument];
  for (const diff of ["Expert", "Hard", "Medium", "Easy"]) {
    for (const suffix of suffixes) {
      const lines = parseBlock(text, `${diff}${suffix}`);
      if (lines.length) return lines;
    }
  }
  return [];
}

function trackHasPlayableNotes(lines: string[]): boolean {
  for (const line of lines) {
    const m = line.match(/^\d+\s*=\s*N\s+(\d+)\s+(\d+)/i);
    if (!m) continue;
    const fret = Number(m[1]);
    if (fret >= 0 && fret <= 4) return true;
  }
  return false;
}

/** Instruments present in this .chart with at least one 0–4 fret gem. */
export function listChartInstruments(text: string): PlayableInstrument[] {
  const found: PlayableInstrument[] = [];
  for (const inst of PLAYABLE_INSTRUMENTS) {
    const lines = pickTrackBlock(text, inst);
    if (lines.length && trackHasPlayableNotes(lines)) found.push(inst);
  }
  return found;
}

export function parseChartFile(
  text: string,
  instrument: PlayableInstrument = "guitar",
): ParsedChart {
  const meta = parseSongMeta(text);
  const tempos = parseTempos(text);
  const lines = pickTrackBlock(text, instrument);
  if (!lines.length) {
    throw new Error(`No ${instrument} track found in chart`);
  }

  const notes: ChartNote[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*=\s*N\s+(\d+)\s+(\d+)/i);
    if (!m) continue;
    const tick = Number(m[1]);
    const fret = Number(m[2]);
    const sustainTicks = Number(m[3]);
    // Frets 0-4 = gems / pads. Higher = force, tap, open, accents — skip.
    if (fret < 0 || fret > 4) continue;
    const t = tickToSeconds(tick, meta.resolution, tempos) - meta.offsetSec;
    const span =
      sustainTicks > 0
        ? tickToSeconds(tick + sustainTicks, meta.resolution, tempos) -
          tickToSeconds(tick, meta.resolution, tempos)
        : 0;
    if (t < -1) continue;
    const sustain = span >= MIN_SUSTAIN_S;
    notes.push({
      t,
      lane: fret,
      dur: sustain ? span : 0,
      tick,
      sustain,
    });
  }

  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  if (!notes.length) {
    throw new Error(`No playable ${instrument} notes in chart`);
  }

  const duration = notes.length
    ? notes[notes.length - 1]!.t + Math.max(1, notes[notes.length - 1]!.dur)
    : 0;

  return {
    name: meta.name,
    artist: meta.artist,
    resolution: meta.resolution,
    offsetSec: meta.offsetSec,
    notes,
    duration,
    instrument,
  };
}
