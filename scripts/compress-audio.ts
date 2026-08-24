/**
 * Convert bundled WAV audio to MP3 256k CBR @ 44.1kHz stereo.
 * Usage: tsx scripts/compress-audio.ts [--dry-run]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const BITRATE = "256k";
const DRY = process.argv.includes("--dry-run");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.toLowerCase().endsWith(".wav")) out.push(full);
  }
  return out;
}

function ffmpeg(args: string[]): boolean {
  return spawnSync("ffmpeg", args, { stdio: DRY ? "pipe" : "inherit" }).status === 0;
}

function totalMb(files: string[]): number {
  return files.reduce((n, f) => n + fs.statSync(f).size, 0) / (1024 * 1024);
}

function convertToMp3(src: string): void {
  const dest = src.replace(/\.wav$/i, ".mp3");
  if (DRY) {
    console.log(`[dry-run] ${path.relative(PUBLIC, src)} → ${path.basename(dest)}`);
    return;
  }
  const tmp = `${dest}.tmp.mp3`;
  const ok = ffmpeg([
    "-y",
    "-i",
    src,
    "-vn",
    "-acodec",
    "libmp3lame",
    "-b:a",
    BITRATE,
    "-ar",
    "44100",
    "-ac",
    "2",
    tmp,
  ]);
  if (!ok) throw new Error(`ffmpeg failed: ${src}`);
  fs.renameSync(tmp, dest);
  fs.unlinkSync(src);
  console.log(`→ ${path.relative(PUBLIC, dest)}`);
}

function main() {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
    throw new Error("ffmpeg is required (brew install ffmpeg)");
  }

  const wavs = walk(PUBLIC);
  if (!wavs.length) {
    console.log("No WAV files under public/ - nothing to convert.");
    return;
  }

  const before = totalMb(wavs);
  console.log(`Converting ${wavs.length} WAV file(s) to MP3 ${BITRATE}…`);
  for (const wav of wavs) convertToMp3(wav);

  const mp3Out = wavs.map((w) => w.replace(/\.wav$/i, ".mp3"));
  const after = totalMb(mp3Out.filter((f) => fs.existsSync(f)));
  console.log(`\nDone. ${before.toFixed(2)} MB WAV → ${after.toFixed(2)} MB MP3`);
}

main();
