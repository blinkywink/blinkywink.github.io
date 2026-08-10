/** Chorus Encore (enchor.us) search + chart download. */

import type { PlayableInstrument } from "./instruments";

export type EnchorHit = {
  name: string;
  artist: string;
  album: string | null;
  year: string | null;
  charter: string | null;
  md5: string;
  chartId: number;
  song_length: number;
  delay: number;
  chart_offset: number;
  video_start_time: number;
  hasVideoBackground: boolean;
  modchart?: boolean;
  /** Clone Hero style score 0–6; -1 = N/A. */
  diff_guitar?: number;
  diff_vocals?: number;
  diff_band?: number;
  notesData?: {
    instruments: string[];
    hasVocals?: boolean;
    hasLyrics?: boolean;
    noteCounts?: { instrument: string; difficulty: string; count: number }[];
    maxNps?: {
      instrument: string;
      difficulty: string;
      nps: number;
      time: number;
    }[];
  } | null;
  albumArtMd5?: string | null;
  folderIssues?: { folderIssue: string; description: string }[];
};

export type EnchorSearchResponse = {
  found: number;
  out_of: number;
  page: number;
  data: EnchorHit[];
};

const API = "https://api.enchor.us";
const FILES = "https://files.enchor.us";

const BLOCKED_FOLDER_ISSUES = new Set([
  "noAudio",
  "noChart",
  "badChart",
  "invalidAudio",
]);

export function enchorSngUrl(md5: string): string {
  return `${FILES}/${md5}.sng`;
}

export function enchorArtUrl(md5: string | null | undefined): string | null {
  if (!md5) return null;
  return `${FILES}/${md5}.jpg`;
}

export function expertNotesFor(
  hit: EnchorHit,
  instrument: PlayableInstrument,
): number | null {
  if (instrument === "vocals") {
    // Encore usually flags vocals with hasVocals, not noteCounts.
    return hit.notesData?.hasVocals ? 1 : null;
  }
  const counts = hit.notesData?.noteCounts;
  if (!counts?.length) return null;
  const expert = counts.find(
    (n) => n.instrument === instrument && n.difficulty === "expert",
  );
  return expert?.count ?? null;
}

/** Song.ini difficulty score (0–6). Null when missing / -1. */
export function diffScoreFor(
  hit: EnchorHit,
  instrument: PlayableInstrument,
): number | null {
  const raw =
    instrument === "vocals" ? hit.diff_vocals : hit.diff_guitar;
  if (raw == null || raw < 0) return null;
  return Math.min(6, Math.max(0, Math.round(raw)));
}

/** Expert max notes-per-second for an instrument. */
export function expertMaxNpsFor(
  hit: EnchorHit,
  instrument: PlayableInstrument,
): number | null {
  const rows = hit.notesData?.maxNps;
  if (!rows?.length) return null;
  const row = rows.find(
    (n) => n.instrument === instrument && n.difficulty === "expert",
  );
  return row != null && Number.isFinite(row.nps) ? row.nps : null;
}

/** Hits that offer Guitar (and Vocals when present). */
export function playableInstrumentsOnHit(
  hit: EnchorHit,
): PlayableInstrument[] {
  const out: PlayableInstrument[] = [];
  const guitar = expertNotesFor(hit, "guitar");
  if (guitar != null && guitar > 0) out.push("guitar");
  if (hit.notesData?.hasVocals) out.push("vocals");
  return out;
}

export function hitHasVocals(hit: EnchorHit): boolean {
  return playableInstrumentsOnHit(hit).includes("vocals");
}

/** Guitar Expert charts (vocals optional). */
export function isPlayableEnchorHit(hit: EnchorHit): boolean {
  if (hit.modchart) return false;
  if (!hit.notesData) return false;
  const instruments = playableInstrumentsOnHit(hit);
  if (!instruments.includes("guitar")) return false;
  for (const issue of hit.folderIssues ?? []) {
    if (BLOCKED_FOLDER_ISSUES.has(issue.folderIssue)) return false;
  }
  return true;
}

export async function searchEnchor(
  query: string,
  opts?: { page?: number; perPage?: number },
): Promise<EnchorSearchResponse> {
  // Over-fetch then filter — Encore doesn't always expose hasVocals as a query flag.
  const body = {
    search: query.trim(),
    instrument: "guitar",
    difficulty: "expert",
    page: opts?.page ?? 1,
    per_page: opts?.perPage ?? 60,
  };
  const res = await fetch(`${API}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Encore search failed (${res.status})`);
  const json = (await res.json()) as EnchorSearchResponse;
  const seen = new Set<string>();
  const data = (json.data ?? []).filter((hit) => {
    if (!isPlayableEnchorHit(hit)) return false;
    if (seen.has(hit.md5)) return false;
    seen.add(hit.md5);
    return true;
  });
  return { ...json, data, found: data.length };
}

export async function downloadSng(md5: string): Promise<ArrayBuffer> {
  const res = await fetch(enchorSngUrl(md5));
  if (!res.ok) throw new Error(`Chart download failed (${res.status})`);
  return res.arrayBuffer();
}
