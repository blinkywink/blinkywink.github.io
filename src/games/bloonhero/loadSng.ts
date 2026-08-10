import { SngStream } from "parse-sng";
import { parseChartFile, type ParsedChart } from "./parseChartFile";

export type LoadedSong = {
  chart: ParsedChart;
  /** Object URL for song audio (opus/ogg/mp3). Revoke when done. */
  audioUrl: string;
  /** Object URL for album art if present. */
  artUrl: string | null;
  delayMs: number;
  ini: Record<string, string>;
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
    if (!line || line.startsWith("[") || line.startsWith("#") || line.startsWith(";"))
      continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const val = line.slice(eq + 1).trim();
    out[key] = val;
  }
  return out;
}

export async function loadSongFromSng(
  buffer: ArrayBuffer,
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

  const chartBytes =
    files.get("notes.chart") ??
    files.get("note.chart") ??
    [...files.entries()].find(([n]) => n.endsWith(".chart"))?.[1];
  if (!chartBytes) {
    throw new Error("This pack has no .chart file (MIDI-only packs coming soon)");
  }

  const chartText = new TextDecoder("utf-8").decode(chartBytes);
  const chart = parseChartFile(chartText);

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

  const audioMime = files.has("song.opus") || files.has("guitar.opus")
    ? "audio/opus"
    : files.has("song.ogg") || files.has("guitar.ogg")
      ? "audio/ogg"
      : "audio/mpeg";
  const audioUrl = URL.createObjectURL(
    new Blob([Uint8Array.from(audioEntry)], { type: audioMime }),
  );

  const artEntry =
    files.get("album.jpg") ??
    files.get("album.png") ??
    files.get("album.jpeg") ??
    null;
  const artUrl = artEntry
    ? URL.createObjectURL(new Blob([Uint8Array.from(artEntry)]))
    : null;

  const iniText = files.get("song.ini")
    ? new TextDecoder("utf-8").decode(files.get("song.ini")!)
    : "";
  const ini = parseIni(iniText);
  const delayMs = Number(ini.delay || 0) || 0;

  // Prefer ini name/artist when present
  if (ini.name) chart.name = ini.name;
  if (ini.artist) chart.artist = ini.artist;

  return { chart, audioUrl, artUrl, delayMs, ini };
}

export function revokeLoadedSong(song: LoadedSong | null): void {
  if (!song) return;
  URL.revokeObjectURL(song.audioUrl);
  if (song.artUrl) URL.revokeObjectURL(song.artUrl);
}
