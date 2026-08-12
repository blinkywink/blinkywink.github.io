import { SngStream } from "parse-sng";
import type { PlayableInstrument } from "./instruments";
import { PLAYABLE_INSTRUMENTS } from "./instruments";
import {
  listChartInstruments,
  parseChartFile,
  type ChartNote,
  type ParsedChart,
} from "./parseChartFile";
import { listMidiInstruments, parseMidiChart } from "./parseMidiChart";
import { parseLyricsFromPack, type LyricPhrase } from "./parseLyrics";
import { isAudioStemFile } from "./stemPlayer";

export type LoadedSong = {
  chart: ParsedChart;
  /** Filled after StemPlayer create — used for revoke. */
  audioUrls: string[];
  /** Raw stem payloads for the player. */
  stemFiles: { name: string; data: Uint8Array }[];
  artUrl: string | null;
  delayMs: number;
  /** Pack song.ini length in seconds (0 if missing). */
  songLengthSec: number;
  ini: Record<string, string>;
  availableInstruments: PlayableInstrument[];
  /** Vocal chart notes for lip-sync (independent of play instrument). */
  vocalsNotes: ChartNote[] | null;
  /** Synced lyric phrases from chart / MIDI events. */
  lyrics: LyricPhrase[];
  setInstrument: (instrument: PlayableInstrument) => ParsedChart;
};

/** Clone Hero / Encore song_length is usually milliseconds. */
export function songLengthSecFromIni(ini: Record<string, string>): number {
  const raw = Number(ini.song_length || ini.songlength || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1000 ? raw / 1000 : raw;
}

async function readStreamAll(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (
      !line ||
      line.startsWith("[") ||
      line.startsWith("#") ||
      line.startsWith(";")
    )
      continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    out[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  return out;
}

function asBlobPart(data: Uint8Array): BlobPart {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

function preferInstrument(
  available: PlayableInstrument[],
  prefer?: PlayableInstrument | null,
): PlayableInstrument {
  if (prefer && available.includes(prefer)) return prefer;
  for (const inst of PLAYABLE_INSTRUMENTS) {
    if (available.includes(inst)) return inst;
  }
  return "guitar";
}

function collectStemFiles(
  files: Map<string, Uint8Array>,
): { name: string; data: Uint8Array }[] {
  const stems: { name: string; data: Uint8Array }[] = [];
  for (const [name, data] of files) {
    if (!isAudioStemFile(name)) continue;
    stems.push({ name, data });
  }
  stems.sort((a, b) => {
    const as = /^song\./i.test(a.name) ? 0 : 1;
    const bs = /^song\./i.test(b.name) ? 0 : 1;
    if (as !== bs) return as - bs;
    return a.name.localeCompare(b.name);
  });
  return stems;
}

export async function loadSongFromSng(
  buffer: ArrayBuffer,
  preferInstrumentName?: PlayableInstrument | null,
): Promise<LoadedSong> {
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });

  const sng = new SngStream(webStream, { generateSongIni: true });
  const files = new Map<string, Uint8Array>();

  const done = new Promise<void>((resolve, reject) => {
    sng.on("error", reject);
    sng.on("file", (name, stream, next) => {
      void (async () => {
        try {
          const data = await readStreamAll(stream);
          files.set(name.toLowerCase(), data);
          if (next) next();
          else resolve();
        } catch (e) {
          reject(e);
        }
      })();
    });
  });

  sng.start();
  await done;

  const iniText = files.get("song.ini")
    ? new TextDecoder("utf-8").decode(files.get("song.ini")!)
    : "";
  const ini = parseIni(iniText);
  const delayMs = Number(ini.delay || 0) || 0;
  const offsetSec = Number(ini.chart_offset || 0) || 0;
  const songLengthSec = songLengthSecFromIni(ini);

  const chartBytes =
    files.get("notes.chart") ??
    files.get("note.chart") ??
    [...files.entries()].find(([n]) => n.endsWith(".chart"))?.[1];

  const midBytes =
    files.get("notes.mid") ??
    files.get("notes.midi") ??
    [...files.entries()].find(([n]) => /\.mid(i)?$/i.test(n))?.[1];

  const fromChart = chartBytes
    ? listChartInstruments(new TextDecoder("utf-8").decode(chartBytes))
    : [];
  const fromMid = midBytes ? listMidiInstruments(midBytes) : [];
  const availableInstruments = PLAYABLE_INSTRUMENTS.filter(
    (inst) => fromChart.includes(inst) || fromMid.includes(inst),
  );

  if (!availableInstruments.length) {
    throw new Error("No guitar or vocals track found in this pack");
  }

  const chartText = chartBytes
    ? new TextDecoder("utf-8").decode(chartBytes)
    : null;

  const parseFor = (instrument: PlayableInstrument): ParsedChart => {
    if (instrument === "vocals") {
      if (!midBytes) throw new Error("Vocals need a notes.mid in this pack");
      const chart = parseMidiChart(midBytes, {
        name: ini.name,
        artist: ini.artist,
        offsetSec,
        instrument: "vocals",
      });
      if (ini.name) chart.name = ini.name;
      if (ini.artist) chart.artist = ini.artist;
      return chart;
    }
    if (chartText && fromChart.includes("guitar")) {
      const chart = parseChartFile(chartText, "guitar");
      if (ini.name) chart.name = ini.name;
      if (ini.artist) chart.artist = ini.artist;
      return chart;
    }
    if (midBytes && fromMid.includes("guitar")) {
      const chart = parseMidiChart(midBytes, {
        name: ini.name,
        artist: ini.artist,
        offsetSec,
        instrument: "guitar",
      });
      if (ini.name) chart.name = ini.name;
      if (ini.artist) chart.artist = ini.artist;
      return chart;
    }
    throw new Error(`No ${instrument} chart in this pack`);
  };

  const chosen = preferInstrument(availableInstruments, preferInstrumentName);
  let chart = parseFor(chosen);

  let vocalsNotes: ChartNote[] | null = null;
  if (availableInstruments.includes("vocals")) {
    try {
      vocalsNotes = parseFor("vocals").notes;
    } catch {
      vocalsNotes = null;
    }
  }

  const stemFiles = collectStemFiles(files);
  if (!stemFiles.length) throw new Error("No song audio found in chart pack");

  const lyrics = parseLyricsFromPack({
    chartText,
    midBytes: midBytes ?? null,
    offsetSec,
  });

  const artEntry =
    files.get("album.jpg") ??
    files.get("album.png") ??
    files.get("album.jpeg") ??
    null;
  const artUrl = artEntry
    ? URL.createObjectURL(new Blob([asBlobPart(artEntry)]))
    : null;

  const loaded: LoadedSong = {
    chart,
    audioUrls: [],
    stemFiles,
    artUrl,
    delayMs,
    songLengthSec,
    ini,
    availableInstruments,
    vocalsNotes,
    lyrics,
    setInstrument(instrument: PlayableInstrument) {
      if (!availableInstruments.includes(instrument)) {
        throw new Error(`${instrument} not in this pack`);
      }
      chart = parseFor(instrument);
      loaded.chart = chart;
      return chart;
    },
  };

  return loaded;
}

export function revokeLoadedSong(song: LoadedSong | null): void {
  if (!song) return;
  for (const url of song.audioUrls) URL.revokeObjectURL(url);
  if (song.artUrl) URL.revokeObjectURL(song.artUrl);
}
