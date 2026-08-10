/**
 * Synced lyric phrases from Clone Hero `[Events]` (.chart) and PART VOCALS (.mid).
 * @see https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/chart-format/Tracks/Lyrics/
 */
import { parseMidi, type MidiEvent } from "midi-file";

/** One timed lyric unit — a syllable within a word group. */
export type LyricCue = {
  /** Seconds from song start (after chart offset). */
  start: number;
  end: number;
  /** @deprecated Revealed portion only — prefer fullWord + revealedChars. */
  text: string;
  /** Complete word once all syllables in the group have landed. */
  fullWord: string;
  /** Characters of fullWord that should be visible at this cue. */
  revealedChars: number;
};

export type LyricDisplay = {
  fullWord: string;
  visible: string;
  pending: string;
  /** 0–1 — fades out after hold when the next word is far away. */
  opacity: number;
};

/** @deprecated Alias for chart loaders — each entry is one timed cue, not a full line. */
export type LyricPhrase = LyricCue;

type TempoEvent = { tick: number; bpm: number };
type RawEv = { tick: number; kind: "phrase_start" | "phrase_end" | "syllable"; text: string };
type Syllable = { text: string; joinNext: boolean };

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

function normalizeQuoted(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.trim();
}

/** Skip chart/MIDI markers — not sung lyric syllables. */
function isNonLyricMarker(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  if (lower === "end") return true;
  if (lower === "phrase_start" || lower === "phrase_end") return false;
  if (lower.startsWith("lyric ")) return false;
  if (lower.startsWith("section ") || lower.startsWith("section_")) return true;
  if (lower.startsWith("prc_")) return true;
  if (lower.startsWith("solo") || lower.startsWith("solo_")) return true;
  // [idle], [play], [music_start], etc.
  if (/^\[[^\]]+\]$/.test(t)) return true;
  return false;
}

/** Turn one raw syllable token into display text (Clone Hero plain-text rules). */
function parseSyllable(raw: string): Syllable | null {
  let s = normalizeQuoted(raw);
  if (s.toLowerCase().startsWith("lyric ")) s = s.slice(6).trim();
  if (isNonLyricMarker(s)) return null;
  if (s === "+" || s === "%") return null;

  // Strip leading pitch/leniency markers.
  s = s.replace(/^[#^*]+/, "");

  let joinNext = false;
  if (s.endsWith("-")) {
    joinNext = true;
    s = s.slice(0, -1);
  } else if (s.endsWith("=")) {
    joinNext = true;
    s = `${s.slice(0, -1)}-`;
  }

  s = s.replace(/\$$/, "");
  s = s.replace(/_/g, " ");
  s = s.replace(/^[#^*%]+|[#^*%]+$/g, "");
  s = s.trim();

  if (!s || s === "+") return null;
  return { text: s, joinNext };
}

type TimedSyl = { tick: number; syl: Syllable };

function wordBounds(timed: TimedSyl[], index: number): { start: number; end: number } {
  let start = index;
  while (start > 0 && timed[start - 1]!.syl.joinNext) start--;
  let end = index;
  while (end < timed.length - 1 && timed[end]!.syl.joinNext) end++;

  // "ev" then "everybody" — same word, no hyphen (pair only, never whole phrases).
  if (
    index > 0 &&
    isPrefixPair(timed, index - 1, index) &&
    !timed[index - 1]!.syl.joinNext
  ) {
    start = index - 1;
    end = index;
  } else if (
    end === start &&
    start + 1 < timed.length &&
    isPrefixPair(timed, start, start + 1)
  ) {
    end = start + 1;
  }

  return { start, end };
}

/** Next syllable completes the same word (e.g. "ev" → "everybody"). */
function isPrefixPair(timed: TimedSyl[], start: number, end: number): boolean {
  if (end !== start + 1) return false;
  const first = timed[start]!.syl.text;
  const last = timed[end]!.syl.text;
  return (
    !timed[start]!.syl.joinNext &&
    first.length > 0 &&
    !first.includes(" ") &&
    !last.includes(" ") &&
    last.length > first.length &&
    last.toLowerCase().startsWith(first.toLowerCase())
  );
}

function fullWordForGroup(timed: TimedSyl[], start: number, end: number): string {
  if (isPrefixPair(timed, start, end)) return timed[end]!.syl.text;
  return assembleSyllables(timed, start, end);
}

function revealedAt(
  timed: TimedSyl[],
  start: number,
  index: number,
  end: number,
): string {
  if (isPrefixPair(timed, start, end)) {
    return index === start ? timed[start]!.syl.text : timed[end]!.syl.text;
  }
  return assembleSyllables(timed, start, index);
}

function assembleSyllables(timed: TimedSyl[], from: number, to: number): string {
  let out = "";
  for (let i = from; i <= to; i++) {
    const s = timed[i]!.syl;
    if (!s.text) continue;
    if (!out) out = s.text;
    else if (timed[i - 1]!.syl.joinNext) out += s.text;
    else out += ` ${s.text}`;
  }
  return out.replace(/\s+/g, " ").trim();
}

function classifyChartEvent(raw: string): RawEv["kind"] | null {
  const text = normalizeQuoted(raw);
  const lower = text.toLowerCase();
  if (lower === "phrase_start") return "phrase_start";
  if (lower === "phrase_end") return "phrase_end";
  if (lower.startsWith("lyric ")) return "syllable";
  return null;
}

function buildCues(
  events: RawEv[],
  tickToSec: (tick: number) => number,
  resolution: number,
): LyricCue[] {
  if (!events.length) return [];
  events.sort((a, b) => a.tick - b.tick);

  const timed: TimedSyl[] = [];
  let lastTick = 0;

  for (const ev of events) {
    if (ev.kind === "phrase_start" || ev.kind === "phrase_end") continue;

    const syl = parseSyllable(ev.text);
    if (!syl) continue;

    const gapTicks = Math.max(resolution * 3, 96);
    if (timed.length > 0 && lastTick > 0 && ev.tick - lastTick > gapTicks) {
      // Long gap — treat as a new phrase for word grouping only.
    }

    timed.push({ tick: ev.tick, syl });
    lastTick = ev.tick;
  }

  if (!timed.length) return [];

  const cues: LyricCue[] = [];
  for (let i = 0; i < timed.length; i++) {
    const { tick } = timed[i]!;
    const start = tickToSec(tick);
    const nextTick =
      timed[i + 1]?.tick ?? tick + Math.max(resolution * 2, 192);
    let end = tickToSec(nextTick) - 0.02;
    const { start: wordStart, end: wordEnd } = wordBounds(timed, i);
    const fullWord = fullWordForGroup(timed, wordStart, wordEnd);
    const revealed = revealedAt(timed, wordStart, i, wordEnd);
    cues.push({
      start,
      end: Math.max(end, start + 0.06),
      text: revealed,
      fullWord,
      revealedChars: revealed.length,
    });
  }

  for (let i = 0; i < cues.length - 1; i++) {
    cues[i]!.end = Math.min(cues[i]!.end, cues[i + 1]!.start - 0.01);
    if (cues[i]!.end <= cues[i]!.start) {
      cues[i]!.end = cues[i + 1]!.start - 0.01;
    }
  }

  /** If the next syllable is far away, don't hold this word until it lands. */
  const BREAK_GAP_SEC = 1.0;
  const HOLD_AFTER_WORD_SEC = 2.2;
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    const next = cues[i + 1];
    const holdEnd = cue.start + HOLD_AFTER_WORD_SEC;
    if (!next) {
      cue.end = Math.min(cue.end, holdEnd);
      continue;
    }
    if (next.start - cue.start > BREAK_GAP_SEC) {
      cue.end = Math.min(cue.end, holdEnd);
    }
  }

  return cues.filter((c) => c.text.length > 0);
}

/** Lyric events live in the global `[Events]` block only — not instrument tracks. */
function collectChartLyricEvents(text: string): RawEv[] {
  const out: RawEv[] = [];
  for (const line of parseBlock(text, "Events")) {
    const m = line.match(/^(\d+)\s*=\s*E\s+(.*)$/i);
    if (!m) continue;
    const kind = classifyChartEvent(m[2]!.trim());
    if (!kind) continue;
    out.push({ tick: Number(m[1]), kind, text: m[2]!.trim() });
  }
  return out;
}

export function parseLyricsFromChart(
  text: string,
  offsetSec = 0,
): LyricCue[] {
  const meta = parseSongMeta(text);
  const tempos = parseTempos(text);
  const resolution = meta.resolution;
  const offset = offsetSec || meta.offsetSec;
  const tickToSec = (tick: number) =>
    tickToSeconds(tick, resolution, tempos) - offset;
  return buildCues(collectChartLyricEvents(text), tickToSec, resolution);
}

type MidiTrack = MidiEvent[];
type MidiTempoEv = { tick: number; usPerBeat: number };

function trackName(track: MidiTrack): string {
  for (const e of track) {
    if (e.type === "trackName") return e.text.trim();
  }
  return "";
}

function findVocalsTrack(tracks: MidiTrack[]): MidiTrack | null {
  for (const name of ["PART VOCALS", "HARM1", "HARM2", "HARM3"]) {
    const tr = tracks.find((t) => trackName(t).toUpperCase() === name);
    if (tr) return tr;
  }
  return (
    tracks.find((t) => /^PART VOCALS$/i.test(trackName(t))) ??
    tracks.find((t) => /VOCAL/i.test(trackName(t))) ??
    null
  );
}

function collectMidiTempos(tracks: MidiTrack[]): MidiTempoEv[] {
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

function classifyMidiText(text: string): RawEv["kind"] | null {
  const t = normalizeQuoted(text);
  const lower = t.toLowerCase();
  if (lower === "phrase_start") return "phrase_start";
  if (lower === "phrase_end") return "phrase_end";
  if (lower.startsWith("lyric ")) return "syllable";
  return null;
}

/** PART VOCALS only — ignore [idle]/[play] markers on other tracks. */
function collectVocalsLyricEvents(track: MidiTrack): RawEv[] {
  const out: RawEv[] = [];
  let tick = 0;
  for (const e of track) {
    tick += e.deltaTime;
    if (e.type === "lyrics" && "text" in e && e.text) {
      out.push({ tick, kind: "syllable", text: e.text });
      continue;
    }
    if (e.type === "text" && "text" in e && e.text) {
      const kind = classifyMidiText(e.text);
      if (kind) out.push({ tick, kind, text: e.text });
    }
  }
  return out;
}

export function parseLyricsFromMidi(
  bytes: Uint8Array,
  offsetSec = 0,
): LyricCue[] {
  const midi = parseMidi(bytes);
  const tpq = midi.header.ticksPerBeat;
  if (!tpq) return [];
  const track = findVocalsTrack(midi.tracks);
  if (!track) return [];
  const tempos = collectMidiTempos(midi.tracks);
  const tickToSec = (tick: number) => midiTickToSec(tick, tpq, tempos) - offsetSec;
  return buildCues(collectVocalsLyricEvents(track), tickToSec, tpq);
}

/** Prefer chart `[Events]` lyrics; fall back to PART VOCALS MIDI. */
export function parseLyricsFromPack(opts: {
  chartText?: string | null;
  midBytes?: Uint8Array | null;
  offsetSec?: number;
}): LyricCue[] {
  const offset = opts.offsetSec ?? 0;
  const fromChart = opts.chartText
    ? parseLyricsFromChart(opts.chartText, offset)
    : [];
  if (fromChart.length) return fromChart;
  return opts.midBytes ? parseLyricsFromMidi(opts.midBytes, offset) : [];
}

export function lyricDisplayAtTime(
  cues: LyricCue[],
  songTime: number,
): LyricDisplay | null {
  if (!cues.length || songTime < -0.5) return null;
  const FADE_SEC = 0.45;
  for (const cue of cues) {
    if (songTime < cue.start - 0.04) continue;
    if (songTime > cue.end + FADE_SEC) continue;
    const visible = cue.fullWord.slice(0, cue.revealedChars);
    const pending = cue.fullWord.slice(cue.revealedChars);
    let opacity = 1;
    if (songTime > cue.end) {
      opacity = Math.max(0, 1 - (songTime - cue.end) / FADE_SEC);
    }
    return { fullWord: cue.fullWord, visible, pending, opacity };
  }
  return null;
}

export function lyricDisplaysEqual(
  a: LyricDisplay | null,
  b: LyricDisplay | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.fullWord === b.fullWord &&
    a.visible === b.visible &&
    a.pending === b.pending &&
    Math.abs(a.opacity - b.opacity) < 0.04
  );
}
