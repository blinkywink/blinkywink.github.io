/**
 * Synced lyric phrases from Clone Hero `.chart` E events and MIDI text/lyrics meta.
 */
import { parseMidi, type MidiEvent } from "midi-file";

export type LyricPhrase = {
  /** Seconds from song start (after chart offset). */
  start: number;
  end: number;
  text: string;
};

type TempoEvent = { tick: number; bpm: number };
type RawEv = { tick: number; text: string };

function parseBlock(text: string, name: string): string[] {
  const re = new RegExp(`\\[${name}\\]\\s*\\{([\\s\\S]*?)\\}`, "i");
  const m = text.match(re);
  if (!m?.[1]) return [];
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
}

function parseSongMeta(text: string): { resolution: number; offsetSec: number } {
  const lines = parseBlock(text, "Song");
  let resolution = 192;
  let offsetSec = 0;
  for (const line of lines) {
    const m = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    let val = m[2]!.trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (key === "resolution") resolution = Number(val) || 192;
    if (key === "offset") offsetSec = Number(val) || 0;
  }
  return { resolution, offsetSec };
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

function normalizeEventText(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.trim();
}

function isSkippedEvent(lower: string): boolean {
  return (
    lower === "end" ||
    lower.startsWith("section ") ||
    lower.startsWith("section_") ||
    lower.startsWith("prc_") ||
    lower.startsWith("solo ") ||
    lower.startsWith("solo_")
  );
}

function buildPhrases(
  events: RawEv[],
  tickToSec: (tick: number) => number,
  resolution: number,
): LyricPhrase[] {
  if (!events.length) return [];
  events.sort((a, b) => a.tick - b.tick || a.text.localeCompare(b.text));

  const phrases: LyricPhrase[] = [];
  let cur: { startTick: number; parts: string[]; lastTick: number } | null =
    null;

  const flush = (endTick: number) => {
    if (!cur?.parts.length) {
      cur = null;
      return;
    }
    const start = tickToSec(cur.startTick);
    const end = tickToSec(endTick);
    phrases.push({
      start,
      end: Math.max(end, start + 0.25),
      text: cur.parts.join(" ").replace(/\s+/g, " ").trim(),
    });
    cur = null;
  };

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const text = normalizeEventText(ev.text);
    const lower = text.toLowerCase();
    if (!text || isSkippedEvent(lower)) continue;

    if (lower === "phrase_start") {
      if (cur) flush(ev.tick);
      cur = { startTick: ev.tick, parts: [], lastTick: ev.tick };
      continue;
    }
    if (lower === "phrase_end") {
      flush(ev.tick);
      continue;
    }

    let syllable = "";
    if (lower.startsWith("lyric ")) {
      syllable = text.slice(6).trim();
    } else if (
      !lower.includes(" ") &&
      lower !== "phrase_start" &&
      lower !== "phrase_end"
    ) {
      // Bare syllable on a vocals track local event.
      syllable = text;
    }

    if (!syllable) continue;
    if (!cur) cur = { startTick: ev.tick, parts: [], lastTick: ev.tick };
    cur.parts.push(syllable);
    cur.lastTick = ev.tick;
  }

  if (cur) {
    flush(cur.lastTick + Math.max(resolution, 96));
  }

  // Extend phrase end until the next phrase starts so subtitles linger naturally.
  for (let i = 0; i < phrases.length - 1; i++) {
    const next = phrases[i + 1]!;
    phrases[i]!.end = Math.max(phrases[i]!.end, next.start - 0.02);
  }
  return phrases.filter((p) => p.text.length > 0);
}

function collectChartEvents(text: string): RawEv[] {
  const out: RawEv[] = [];
  const blockRe = /\[[^\]]+\]\s*\{([\s\S]*?)\}/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(text))) {
    for (const raw of block[1]!.split("\n")) {
      const line = raw.trim();
      const m = line.match(/^(\d+)\s*=\s*E\s+(.*)$/i);
      if (!m) continue;
      out.push({ tick: Number(m[1]), text: m[2]!.trim() });
    }
  }
  return out;
}

export function parseLyricsFromChart(
  text: string,
  offsetSec = 0,
): LyricPhrase[] {
  const meta = parseSongMeta(text);
  const tempos = parseTempos(text);
  const resolution = meta.resolution;
  const offset = offsetSec || meta.offsetSec;
  const tickToSec = (tick: number) =>
    tickToSeconds(tick, resolution, tempos) - offset;
  return buildPhrases(collectChartEvents(text), tickToSec, resolution);
}

type MidiTempoEv = { tick: number; usPerBeat: number };

function collectMidiTempos(tracks: MidiEvent[][]): MidiTempoEv[] {
  const tempos: MidiTempoEv[] = [];
  for (const track of tracks) {
    let tick = 0;
    for (const e of track) {
      tick += e.deltaTime;
      if (e.type === "setTempo") {
        tempos.push({ tick, usPerBeat: e.microsecondsPerBeat });
      }
    }
  }
  tempos.sort((a, b) => a.tick - b.tick);
  if (!tempos.length) tempos.push({ tick: 0, usPerBeat: 500_000 });
  if (tempos[0]!.tick !== 0) {
    tempos.unshift({ tick: 0, usPerBeat: tempos[0]!.usPerBeat });
  }
  const byTick = new Map<number, number>();
  for (const t of tempos) byTick.set(t.tick, t.usPerBeat);
  return [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, usPerBeat]) => ({ tick, usPerBeat }));
}

function midiTickToSec(
  tick: number,
  tpq: number,
  tempos: MidiTempoEv[],
): number {
  let time = 0;
  let prev = 0;
  let us = tempos[0]?.usPerBeat ?? 500_000;
  for (const ev of tempos) {
    if (ev.tick > tick) break;
    if (ev.tick > prev) {
      time += ((ev.tick - prev) / tpq) * (us / 1_000_000);
      prev = ev.tick;
    }
    us = ev.usPerBeat;
  }
  if (tick > prev) {
    time += ((tick - prev) / tpq) * (us / 1_000_000);
  }
  return time;
}

function collectMidiEvents(tracks: MidiEvent[][]): RawEv[] {
  const out: RawEv[] = [];
  for (const track of tracks) {
    let tick = 0;
    for (const e of track) {
      tick += e.deltaTime;
      if (e.type === "lyrics" && "text" in e && e.text) {
        out.push({ tick, text: `lyric ${e.text}` });
        continue;
      }
      if (e.type === "text" && "text" in e && e.text) {
        out.push({ tick, text: e.text });
      }
    }
  }
  return out;
}

export function parseLyricsFromMidi(
  bytes: Uint8Array,
  offsetSec = 0,
): LyricPhrase[] {
  const midi = parseMidi(bytes);
  const tpq = midi.header.ticksPerBeat;
  if (!tpq) return [];
  const tempos = collectMidiTempos(midi.tracks);
  const tickToSec = (tick: number) => midiTickToSec(tick, tpq, tempos) - offsetSec;
  return buildPhrases(collectMidiEvents(midi.tracks), tickToSec, tpq);
}

/** Pick the richest lyric list available. */
export function parseLyricsFromPack(opts: {
  chartText?: string | null;
  midBytes?: Uint8Array | null;
  offsetSec?: number;
}): LyricPhrase[] {
  const offset = opts.offsetSec ?? 0;
  const fromChart = opts.chartText
    ? parseLyricsFromChart(opts.chartText, offset)
    : [];
  const fromMid = opts.midBytes ? parseLyricsFromMidi(opts.midBytes, offset) : [];
  if (fromChart.length >= fromMid.length) return fromChart;
  return fromMid;
}

export function lyricAtTime(
  phrases: LyricPhrase[],
  songTime: number,
): string | null {
  if (!phrases.length || songTime < -0.5) return null;
  for (const p of phrases) {
    if (songTime >= p.start - 0.08 && songTime <= p.end + 0.12) {
      return p.text;
    }
  }
  return null;
}
