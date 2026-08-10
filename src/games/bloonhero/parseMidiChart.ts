/**
 * Clone Hero / Rock Band `notes.mid` → Expert 5-lane notes.
 * Guitar: frets 96–100. Vocals: sung pitches mapped onto the same 5 lanes.
 */
import { parseMidi, type MidiEvent } from "midi-file";
import {
  MIDI_TRACK_NAMES,
  PLAYABLE_INSTRUMENTS,
  type PlayableInstrument,
} from "./instruments";
import type { ChartNote, ParsedChart } from "./parseChartFile";

const EXPERT_BASE = 96;
/** Typical sung pitch window (exclude percussion / markers ≥ 96). */
const VOCAL_PITCH_MIN = 36;
const VOCAL_PITCH_MAX = 84;

type MidiTrack = MidiEvent[];
type TempoEv = { tick: number; usPerBeat: number };

function trackName(track: MidiTrack): string {
  for (const e of track) {
    if (e.type === "trackName") return e.text.trim();
  }
  return "";
}

function collectTempos(tracks: MidiTrack[]): TempoEv[] {
  const tempos: TempoEv[] = [];
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

function tickToSec(tick: number, tpq: number, tempos: TempoEv[]): number {
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

function findInstrumentTrack(
  tracks: MidiTrack[],
  instrument: PlayableInstrument,
): MidiTrack | null {
  const prefer = MIDI_TRACK_NAMES[instrument];
  for (const name of prefer) {
    const tr = tracks.find((t) => trackName(t).toUpperCase() === name);
    if (tr) return tr;
  }
  if (instrument === "guitar") {
    return tracks.find((t) => /GUITAR/i.test(trackName(t))) ?? null;
  }
  if (instrument === "vocals") {
    return (
      tracks.find((t) => /^PART VOCALS$/i.test(trackName(t))) ??
      tracks.find((t) => /VOCAL/i.test(trackName(t))) ??
      null
    );
  }
  return null;
}

function isPlayableMidiPitch(
  instrument: PlayableInstrument,
  noteNumber: number,
): boolean {
  if (instrument === "guitar") {
    return noteNumber >= EXPERT_BASE && noteNumber <= EXPERT_BASE + 4;
  }
  // Vocals: sung pitches only (not percussion / phrase markers).
  return noteNumber >= VOCAL_PITCH_MIN && noteNumber <= VOCAL_PITCH_MAX;
}

function midiPitchToLane(
  instrument: PlayableInstrument,
  noteNumber: number,
): number {
  if (instrument === "guitar") return noteNumber - EXPERT_BASE;
  // Spread sung pitches across D F J K L.
  const span = VOCAL_PITCH_MAX - VOCAL_PITCH_MIN;
  const u = (noteNumber - VOCAL_PITCH_MIN) / span;
  return Math.min(4, Math.max(0, Math.round(u * 4)));
}

function expertNoteCount(
  track: MidiTrack,
  instrument: PlayableInstrument,
): number {
  let n = 0;
  for (const e of track) {
    if (
      e.type === "noteOn" &&
      e.velocity > 0 &&
      isPlayableMidiPitch(instrument, e.noteNumber)
    ) {
      n += 1;
    }
  }
  return n;
}

export function listMidiInstruments(bytes: Uint8Array): PlayableInstrument[] {
  const midi = parseMidi(bytes);
  const found: PlayableInstrument[] = [];
  for (const inst of PLAYABLE_INSTRUMENTS) {
    const tr = findInstrumentTrack(midi.tracks, inst);
    if (tr && expertNoteCount(tr, inst) > 0) found.push(inst);
  }
  return found;
}

export function parseMidiChart(
  bytes: Uint8Array,
  opts?: {
    name?: string;
    artist?: string;
    offsetSec?: number;
    instrument?: PlayableInstrument;
  },
): ParsedChart {
  const instrument = opts?.instrument ?? "guitar";
  const midi = parseMidi(bytes);
  const tpq = midi.header.ticksPerBeat;
  if (!tpq) throw new Error("MIDI uses SMPTE timing (unsupported)");

  const sustainCutoffTicks = Math.floor((tpq * 4) / 12);
  const tempos = collectTempos(midi.tracks);
  const track = findInstrumentTrack(midi.tracks, instrument);
  if (!track) throw new Error(`No ${instrument} MIDI track found`);

  const open = new Map<number, number>();
  const raw: { tick: number; lane: number; endTick: number }[] = [];
  let tick = 0;

  for (const e of track) {
    tick += e.deltaTime;
    if (e.type === "noteOn" && e.velocity > 0) {
      const n = e.noteNumber;
      if (!isPlayableMidiPitch(instrument, n)) continue;
      open.set(n, tick);
    } else if (
      e.type === "noteOff" ||
      (e.type === "noteOn" && e.velocity === 0)
    ) {
      const n = e.noteNumber;
      const start = open.get(n);
      if (start == null) continue;
      open.delete(n);
      if (!isPlayableMidiPitch(instrument, n)) continue;
      raw.push({
        tick: start,
        lane: midiPitchToLane(instrument, n),
        endTick: Math.max(start, tick),
      });
    }
  }

  const offset = opts?.offsetSec ?? 0;
  const notes: ChartNote[] = raw.map((r) => {
    const t = tickToSec(r.tick, tpq, tempos) - offset;
    const end = tickToSec(r.endTick, tpq, tempos) - offset;
    const span = Math.max(0, end - t);
    const sustain = r.endTick - r.tick > sustainCutoffTicks;
    return {
      t,
      lane: r.lane,
      dur: sustain ? span : 0,
      tick: r.tick,
      sustain,
    };
  });

  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  if (!notes.length) throw new Error(`No playable ${instrument} notes in MIDI`);

  const last = notes[notes.length - 1]!;
  const duration = last.t + Math.max(1, last.dur);

  return {
    name: opts?.name ?? "Unknown",
    artist: opts?.artist ?? "Unknown",
    resolution: tpq,
    offsetSec: offset,
    notes,
    duration,
    instrument,
  };
}
