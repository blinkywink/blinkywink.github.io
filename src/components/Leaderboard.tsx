import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { AvatarCrop } from "../lib/avatar";
import {
  fetchLeaderboardPage,
  LEADERBOARD_PAGE_SIZE,
  type LeaderboardEntry,
} from "../lib/leaderboardRanks";
import { cacheGetStale } from "../lib/cache";
import { searchProfilesByUsername } from "../lib/profiles";
import {
  hasPlayerChrome,
  playerChromeStyle,
} from "../lib/profileCosmetics";
import { LoadingDots } from "./LoadingDots";
import { PlayerBadges } from "./PlayerBadges";
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
  /** Global rank among top board, when known. */
  rank: number | null;
  badgeIds: string[];
};

function entryToRow(entry: LeaderboardEntry): Row {
  return { ...entry };
}

export function Leaderboard({ onBack: _onBack, onOpenCollection }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchRows, setSearchRows] = useState<Row[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const applyPage = useCallback((page: LeaderboardEntry[]) => {
    setRows(page.map(entryToRow));
    offsetRef.current = page.length;
    setHasMore(page.length === LEADERBOARD_PAGE_SIZE);
  }, []);

  const load = useCallback(async (force = false) => {
    if (force) setLoading(true);
    setError(null);
    try {
      const page = await fetchLeaderboardPage(0, {
        force,
        revalidate: !force,
        onRevalidate: applyPage,
      });
      applyPage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      if (force) {
        setRows([]);
        offsetRef.current = 0;
        setHasMore(false);
      }
    }
    setLoading(false);
  }, [applyPage]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchLeaderboardPage(offsetRef.current);
      setRows((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        const extra = page.filter((row) => !seen.has(row.id)).map(entryToRow);
        return extra.length ? [...prev, ...extra] : prev;
      });
      offsetRef.current += page.length;
      setHasMore(page.length === LEADERBOARD_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more.");
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore]);

  useEffect(() => {
    const cached = cacheGetStale<LeaderboardEntry[]>(
      `leaderboard:page:0:${LEADERBOARD_PAGE_SIZE}`,
    );
    if (cached?.length) {
      applyPage(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void load();
  }, [load, applyPage]);

  useEffect(() => {
    const tick = () => void load(false);
    const id = window.setInterval(tick, 45_000);
    const onWake = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [load]);

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;

  useEffect(() => {
    if (!searching) {
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
          const hits = await searchProfilesByUsername(trimmed, 50);
          if (cancelled) return;
          setSearchRows(
            hits.map((h) => ({
              id: h.userId,
              username: h.username,
              coins_earned: h.coinsEarned,
              avatar: h.avatar,
              accentColor: h.accentColor,
              rank: null,
              badgeIds: h.badgeIds,
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
  }, [searching, trimmed]);

  useEffect(() => {
    if (searching || loading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      void loadMore();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "480px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [searching, loading, hasMore, loadMore, rows.length]);

  const displayRows = useMemo(() => {
    if (!searching) return rows;
    const rankById = new Map(rows.map((r) => [r.id, r.rank]));
    return searchRows
      .map((hit) => ({
        ...hit,
        rank: rankById.get(hit.id) ?? hit.rank,
      }))
      .sort(
        (a, b) =>
          b.coins_earned - a.coins_earned ||
          a.username.localeCompare(b.username),
      );
  }, [searching, rows, searchRows]);

  const showEmptySearch =
    searching &&
    !searchLoading &&
    displayRows.length === 0 &&
    !searchError;

  return (
    <div className="board-page">
      <main className="board-main">
        <div className="board-toolbar">
          <label className="board-search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Username…"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search players"
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

        {searching && searchLoading && searchRows.length === 0 ? (
          <LoadingDots label="Searching players" />
        ) : searchError ? (
          <p className="board-status board-status--err" role="alert">
            {searchError}
          </p>
        ) : showEmptySearch ? (
          <p className="board-status">No players match “{trimmed}”.</p>
        ) : loading ? (
          <LoadingDots label="Loading leaderboard" />
        ) : error && rows.length === 0 ? (
          <p className="board-status board-status--err" role="alert">
            {error}
          </p>
        ) : rows.length === 0 && !searching ? (
          <p className="board-status">No accounts yet.</p>
        ) : (
          <>
            <ul className="board-list">
              {displayRows.map((row) => {
                const mine = user?.id === row.id;
                const chrome = playerChromeStyle({
                  accentColor: row.accentColor,
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
                        {row.rank ?? "-"}
                      </span>
                      <UserAvatar crop={row.avatar} size={56} />
                      <span className="board-card__who">
                        <span className="board-card__name">
                          <span className="board-card__username">
                            {row.username}
                          </span>
                          {mine ? (
                            <span className="board-card__you">you</span>
                          ) : null}
                        </span>
                        <span className="board-card__badges">
                          <PlayerBadges
                            rank={row.rank}
                            badgeIds={row.badgeIds}
                            size="sm"
                          />
                        </span>
                      </span>
                      <span className="board-card__earned">
                        {row.coins_earned.toLocaleString("en-US")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!searching && hasMore ? (
              <div ref={sentinelRef} className="board-more">
                {loadingMore ? <LoadingDots label="Loading more players" /> : null}
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
