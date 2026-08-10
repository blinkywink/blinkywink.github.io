/** Chorus Encore (enchor.us) search + chart download. */

import {
  PLAYABLE_INSTRUMENTS,
  type PlayableInstrument,
} from "./instruments";

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
  notesData?: {
    instruments: string[];
    noteCounts?: { instrument: string; difficulty: string; count: number }[];
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
  const counts = hit.notesData?.noteCounts;
  if (!counts?.length) return null;
  const expert = counts.find(
    (n) => n.instrument === instrument && n.difficulty === "expert",
  );
  return expert?.count ?? null;
}

/** @deprecated use expertNotesFor(hit, "guitar") */
export function expertGuitarNotes(hit: EnchorHit): number | null {
  return expertNotesFor(hit, "guitar");
}

export function playableInstrumentsOnHit(
  hit: EnchorHit,
): PlayableInstrument[] {
  const out: PlayableInstrument[] = [];
  for (const inst of PLAYABLE_INSTRUMENTS) {
    const n = expertNotesFor(hit, inst);
    if (n != null && n > 0) out.push(inst);
  }
  return out;
}

/** Keep packs we can play on guitar, bass, or drums Expert. */
export function isPlayableEnchorHit(hit: EnchorHit): boolean {
  if (hit.modchart) return false;
  if (!hit.notesData) return false;
  if (!playableInstrumentsOnHit(hit).length) return false;
  for (const issue of hit.folderIssues ?? []) {
    if (BLOCKED_FOLDER_ISSUES.has(issue.folderIssue)) return false;
  }
  return true;
}

export async function searchEnchor(
  query: string,
  opts?: { page?: number; perPage?: number },
): Promise<EnchorSearchResponse> {
  const body = {
    search: query.trim(),
    instrument: null,
    difficulty: "expert",
    page: opts?.page ?? 1,
    per_page: opts?.perPage ?? 40,
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
