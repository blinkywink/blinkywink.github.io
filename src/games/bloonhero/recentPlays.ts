import { supabase, supabaseConfigured } from "../../lib/supabase";
import type { EnchorHit } from "./enchorApi";

export type BloonHeroRecentPlay = {
  id: number;
  userId: string | null;
  username: string;
  md5: string;
  chartId: number | null;
  songName: string;
  artist: string;
  albumArtMd5: string | null;
  charter: string | null;
  songLength: number | null;
  playedAt: string;
};

type RecentRow = {
  id: number;
  user_id: string | null;
  username: string;
  md5: string;
  chart_id: number | null;
  song_name: string;
  artist: string;
  album_art_md5: string | null;
  charter: string | null;
  song_length: number | null;
  played_at: string;
};

export async function fetchBloonHeroRecentPlays(
  limit = 16,
): Promise<BloonHeroRecentPlay[]> {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase.rpc("get_bloonhero_recent_plays", {
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RecentRow[]).map((r) => ({
    id: Number(r.id),
    userId: r.user_id ?? null,
    username: String(r.username || "Player"),
    md5: String(r.md5),
    chartId: r.chart_id == null ? null : Number(r.chart_id),
    songName: String(r.song_name || "Song"),
    artist: String(r.artist || "Unknown"),
    albumArtMd5: r.album_art_md5 ?? null,
    charter: r.charter ?? null,
    songLength: r.song_length == null ? null : Number(r.song_length),
    playedAt: String(r.played_at),
  }));
}

export async function recordBloonHeroPlay(hit: EnchorHit): Promise<void> {
  if (!supabaseConfigured) return;
  const { error } = await supabase.rpc("record_bloonhero_play", {
    p_md5: hit.md5,
    p_chart_id: hit.chartId ?? null,
    p_song_name: hit.name,
    p_artist: hit.artist,
    p_album_art_md5: hit.albumArtMd5 ?? null,
    p_charter: hit.charter ?? null,
    p_song_length: hit.song_length ?? null,
  });
  if (error) {
    // Non-fatal — song pick should still work offline / pre-migration.
    console.warn("Bloon Hero recent play not saved:", error.message);
  }
}

/** Turn a recent-play row into enough of an Enchor hit to pick/download. */
export function recentPlayToHit(row: BloonHeroRecentPlay): EnchorHit {
  return {
    name: row.songName,
    artist: row.artist,
    album: null,
    year: null,
    charter: row.charter,
    md5: row.md5,
    chartId: row.chartId ?? 0,
    song_length: row.songLength ?? 0,
    delay: 0,
    chart_offset: 0,
    video_start_time: 0,
    hasVideoBackground: false,
    albumArtMd5: row.albumArtMd5,
    notesData: {
      instruments: ["guitar"],
      hasVocals: false,
      noteCounts: [{ instrument: "guitar", difficulty: "expert", count: 1 }],
    },
  };
}
