import { SngStream } from "parse-sng";
import type { PlayableInstrument } from "./instruments";
import { PLAYABLE_INSTRUMENTS } from "./instruments";
import {
  listChartInstruments,
  parseChartFile,
  type ParsedChart,
} from "./parseChartFile";
import { listMidiInstruments, parseMidiChart } from "./parseMidiChart";

export type LoadedSong = {
  chart: ParsedChart;
  audioUrl: string;
  artUrl: string | null;
  delayMs: number;
  ini: Record<string, string>;
  availableInstruments: PlayableInstrument[];
  setInstrument: (instrument: PlayableInstrument) => ParsedChart;
};

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

  const chartBytes =
    files.get("notes.chart") ??
    files.get("note.chart") ??
    [...files.entries()].find(([n]) => n.endsWith(".chart"))?.[1];

  const midBytes =
    files.get("notes.mid") ??
    files.get("notes.midi") ??
    [...files.entries()].find(([n]) => /\.mid(i)?$/i.test(n))?.[1];

  // Chart + MIDI often coexist — guitar in .chart, vocals only in .mid.
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
    // Prefer native source per instrument.
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
    // Guitar: .chart first, then MIDI
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

  const audioEntry =
    files.get("song.opus") ??
    files.get("song.ogg") ??
    files.get("guitar.opus") ??
    files.get("guitar.ogg") ??
    files.get("song.mp3") ??
    [...files.entries()].find(([n]) =>
      /\.(opus|ogg|mp3|wav|m4a)$/i.test(n),
    )?.[1];
  if (!audioEntry) throw new Error("No song audio found in chart pack");

  const audioMime =
    files.has("song.opus") || files.has("guitar.opus")
      ? "audio/opus"
      : files.has("song.ogg") || files.has("guitar.ogg")
        ? "audio/ogg"
        : "audio/mpeg";
  const audioUrl = URL.createObjectURL(
    new Blob([asBlobPart(audioEntry)], { type: audioMime }),
  );

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
    audioUrl,
    artUrl,
    delayMs,
    ini,
    availableInstruments,
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
  URL.revokeObjectURL(song.audioUrl);
  if (song.artUrl) URL.revokeObjectURL(song.artUrl);
}
