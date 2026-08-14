import { supabase, supabaseConfigured } from "../../lib/supabase";
import type { EnchorHit } from "./enchorApi";

const GUEST_KEY = "bloonhero-favorites-guest-v1";

function accountKey(userId: string): string {
  return `bloonhero-favorites-${userId}-v1`;
}

export function compactFavoriteHit(hit: EnchorHit): EnchorHit {
  const nd = hit.notesData;
  return {
    name: hit.name,
    artist: hit.artist,
    album: hit.album ?? null,
    year: hit.year ?? null,
    charter: hit.charter ?? null,
    md5: String(hit.md5 || "").toLowerCase(),
    chartId: hit.chartId ?? 0,
    song_length: hit.song_length ?? 0,
    delay: hit.delay ?? 0,
    chart_offset: hit.chart_offset ?? 0,
    video_start_time: hit.video_start_time ?? 0,
    hasVideoBackground: Boolean(hit.hasVideoBackground),
    modchart: hit.modchart,
    diff_guitar: hit.diff_guitar,
    diff_vocals: hit.diff_vocals,
    diff_band: hit.diff_band,
    albumArtMd5: hit.albumArtMd5 ?? null,
    notesData: nd
      ? {
          instruments: nd.instruments ?? ["guitar"],
          hasVocals: Boolean(nd.hasVocals),
          hasLyrics: nd.hasLyrics,
          noteCounts: nd.noteCounts,
          maxNps: nd.maxNps,
        }
      : {
          instruments: ["guitar"],
          hasVocals: false,
          noteCounts: [
            { instrument: "guitar", difficulty: "expert", count: 1 },
          ],
        },
  };
}

function readLocal(key: string): EnchorHit[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EnchorHit[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((h) => h && typeof h.md5 === "string" && h.md5.length >= 8)
      .map(compactFavoriteHit);
  } catch {
    return [];
  }
}

function writeLocal(key: string, hits: EnchorHit[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(hits.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

export function loadLocalFavorites(userId: string | null): EnchorHit[] {
  return readLocal(userId ? accountKey(userId) : GUEST_KEY);
}

export function saveLocalFavorites(
  userId: string | null,
  hits: EnchorHit[],
): void {
  writeLocal(userId ? accountKey(userId) : GUEST_KEY, hits);
}

export async function fetchAccountFavorites(): Promise<EnchorHit[]> {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase.rpc("get_bloonhero_favorites");
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter((h) => h && typeof (h as EnchorHit).md5 === "string")
    .map((h) => compactFavoriteHit(h as EnchorHit));
}

export async function persistAccountFavorite(
  hit: EnchorHit,
  on: boolean,
): Promise<void> {
  if (!supabaseConfigured) return;
  const compact = compactFavoriteHit(hit);
  const { error } = await supabase.rpc("set_bloonhero_favorite", {
    p_md5: compact.md5,
    p_hit: compact,
    p_on: on,
  });
  if (error) throw new Error(error.message);
}
