/** Chorus Encore (enchor.us) search + chart download. */

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
  notesData?: {
    instruments: string[];
    noteCounts?: { instrument: string; difficulty: string; count: number }[];
  };
  albumArtMd5?: string | null;
};

export type EnchorSearchResponse = {
  found: number;
  out_of: number;
  page: number;
  data: EnchorHit[];
};

const API = "https://api.enchor.us";
const FILES = "https://files.enchor.us";

export function enchorSngUrl(md5: string): string {
  return `${FILES}/${md5}.sng`;
}

export function enchorArtUrl(md5: string | null | undefined): string | null {
  if (!md5) return null;
  return `${FILES}/${md5}.jpg`;
}

export async function searchEnchor(
  query: string,
  opts?: { page?: number; perPage?: number },
): Promise<EnchorSearchResponse> {
  const body = {
    search: query.trim(),
    instrument: "guitar",
    difficulty: "expert",
    page: opts?.page ?? 1,
    per_page: opts?.perPage ?? 24,
  };
  const res = await fetch(`${API}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Encore search failed (${res.status})`);
  return (await res.json()) as EnchorSearchResponse;
}

export async function downloadSng(md5: string): Promise<ArrayBuffer> {
  const res = await fetch(enchorSngUrl(md5));
  if (!res.ok) throw new Error(`Chart download failed (${res.status})`);
  return res.arrayBuffer();
}
