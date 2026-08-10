/**
 * Minimal Clone Hero / Moonscraper `.chart` parser (ExpertSingle).
 * Frets 0–4 map to lanes D F J K L.
 */

export type ChartNote = {
  t: number;
  lane: number;
  dur: number;
  tick: number;
};

export type ParsedChart = {
  name: string;
  artist: string;
  resolution: number;
  offsetSec: number;
  notes: ChartNote[];
  duration: number;
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
    // 0 = B 120000   (BPM * 1000)
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

/** Prefer Expert → Hard → Medium → Easy Single (5-fret guitar). */
function pickTrackBlock(text: string): string[] {
  for (const diff of ["Expert", "Hard", "Medium", "Easy"]) {
    const lines = parseBlock(text, `${diff}Single`);
    if (lines.length) return lines;
  }
  return [];
}

export function parseChartFile(text: string): ParsedChart {
  const meta = parseSongMeta(text);
  const tempos = parseTempos(text);
  const lines = pickTrackBlock(text);
  if (!lines.length) {
    throw new Error("No guitar (Single) track found in chart");
  }

  const notes: ChartNote[] = [];
  for (const line of lines) {
    // 960 = N 2 0   OR  960 = N 2 192 (sustain ticks)
    const m = line.match(/^(\d+)\s*=\s*N\s+(\d+)\s+(\d+)/i);
    if (!m) continue;
    const tick = Number(m[1]);
    const fret = Number(m[2]);
    const sustainTicks = Number(m[3]);
    // Frets 0-4 = colored gems. 5 = force, 6 = tap, 7 = open — skip specials for now
    if (fret < 0 || fret > 4) continue;
    const t = tickToSeconds(tick, meta.resolution, tempos) - meta.offsetSec;
    const dur =
      sustainTicks > 0
        ? tickToSeconds(tick + sustainTicks, meta.resolution, tempos) -
          tickToSeconds(tick, meta.resolution, tempos)
        : 0.08;
    if (t < -1) continue;
    notes.push({ t, lane: fret, dur: Math.max(0.06, dur), tick });
  }

  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
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
  };
}
