import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "../lib/avatar";
import { supabase } from "../lib/supabase";
import { cached, CacheTtl } from "../lib/cache";
import { searchProfilesByUsername } from "../lib/profiles";
import {
  hasPlayerChrome,
  normalizeAccentColor,
  playerChromeStyle,
} from "../lib/profileCosmetics";
import { PageHeader } from "./PageHeader";
import { UserAvatar } from "./UserAvatar";

export type LeaderboardPlayer = {
  userId: string;
  username: string;
};

type Props = {
  onBack: () => void;
  onOpenCollection: (player: LeaderboardPlayer) => void;
};

type Row = {
  id: string;
  username: string;
  coins_earned: number;
  avatar: AvatarCrop;
  accentColor: string | null;
  auraCardId: string | null;
  /** Global rank among top board, when known. */
  rank: number | null;
};

function mapProfileRow(r: {
  id: string;
  username: string;
  coins_earned: number;
  avatar_card_id: string | null;
  avatar_zoom: number | null;
  avatar_x: number | null;
  avatar_y: number | null;
  accent_color?: string | null;
  aura_card_id?: string | null;
}, rank: number | null): Row {
  return {
    id: String(r.id),
    username: String(r.username ?? "Player"),
    coins_earned: Number(r.coins_earned) || 0,
    avatar: normalizeAvatarCrop({
      cardId: r.avatar_card_id ?? null,
      zoom: r.avatar_zoom ?? DEFAULT_AVATAR_CROP.zoom,
      x: r.avatar_x ?? DEFAULT_AVATAR_CROP.x,
      y: r.avatar_y ?? DEFAULT_AVATAR_CROP.y,
    }),
    accentColor: normalizeAccentColor(r.accent_color),
    auraCardId: r.aura_card_id ? String(r.aura_card_id) : null,
    rank,
  };
}

export function Leaderboard({ onBack: _onBack, onOpenCollection }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchRows, setSearchRows] = useState<Row[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const next = await cached(
        "leaderboard:top100",
        CacheTtl.leaderboard,
        async () => {
          const { data, error: err } = await supabase
            .from("profiles")
            .select(
              "id, username, coins_earned, avatar_card_id, avatar_zoom, avatar_x, avatar_y, accent_color, aura_card_id",
            )
            .order("coins_earned", { ascending: false })
            .limit(100);

          if (err) throw new Error(err.message);
          return (data ?? []).map((r, i) => mapProfileRow(r, i + 1));
        },
        { force },
      );
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setSearchRows([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const hits = await searchProfilesByUsername(trimmed);
          if (cancelled) return;
          setSearchRows(
            hits.map((h) => ({
              id: h.userId,
              username: h.username,
              coins_earned: h.coinsEarned,
              avatar: h.avatar,
              accentColor: h.accentColor,
              auraCardId: h.auraCardId,
              rank: null,
            })),
          );
        } catch (err) {
          if (cancelled) return;
          setSearchRows([]);
          setSearchError(
            err instanceof Error ? err.message : "Search failed.",
          );
        } finally {
          if (!cancelled) setSearchLoading(false);
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const displayRows = useMemo(() => {
    if (!trimmed) return rows;

    const q = trimmed.toLowerCase();
    const rankById = new Map(rows.map((r) => [r.id, r.rank]));
    const local = rows.filter((r) => r.username.toLowerCase().includes(q));
    const byId = new Map(local.map((r) => [r.id, r]));

    for (const hit of searchRows) {
      const existing = byId.get(hit.id);
      if (existing) continue;
      byId.set(hit.id, {
        ...hit,
        rank: rankById.get(hit.id) ?? null,
      });
    }

    return [...byId.values()].sort(
      (a, b) => b.coins_earned - a.coins_earned || a.username.localeCompare(b.username),
    );
  }, [trimmed, rows, searchRows]);

  const showEmptySearch =
    Boolean(trimmed) &&
    !loading &&
    !searchLoading &&
    displayRows.length === 0 &&
    !error &&
    !searchError;

  return (
    <div className="board-page">
      <PageHeader
        eyebrow="Players"
        title="Leaderboard"
        blurb="Lifetime Cash earned · tap a player to view cards"
      />
      <main className="board-main">
        <div className="board-toolbar">
          <label className="board-search">
            <span className="board-search__label">Search players</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Username…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => void load(true)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="board-status">Loading…</p>
        ) : error ? (
          <p className="board-status board-status--err" role="alert">
            {error}
          </p>
        ) : searchError ? (
          <p className="board-status board-status--err" role="alert">
            {searchError}
          </p>
        ) : showEmptySearch ? (
          <p className="board-status">No players match “{trimmed}”.</p>
        ) : rows.length === 0 && !trimmed ? (
          <p className="board-status">No accounts yet.</p>
        ) : (
          <>
            {trimmed && searchLoading ? (
              <p className="board-status">Searching…</p>
            ) : null}
            <ul className="board-list">
              {displayRows.map((row) => {
                const mine = user?.id === row.id;
                const chrome = playerChromeStyle({
                  accentColor: row.accentColor,
                  auraCardId: row.auraCardId,
                });
                const chromeOn = hasPlayerChrome(chrome);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`board-card${mine ? " is-you" : ""}${chromeOn ? " has-player-chrome" : ""}`}
                      style={chromeOn ? chrome : undefined}
                      onClick={() =>
                        onOpenCollection({
                          userId: row.id,
                          username: row.username,
                        })
                      }
                    >
                      <span className="board-card__rank">
                        {row.rank ?? "—"}
                      </span>
                      <UserAvatar crop={row.avatar} size={56} />
                      <span className="board-card__name">
                        {row.username}
                        {mine ? (
                          <span className="board-card__you">you</span>
                        ) : null}
                      </span>
                      <span className="board-card__earned">
                        {row.coins_earned.toLocaleString("en-US")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
