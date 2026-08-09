import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "../lib/avatar";
import { supabase } from "../lib/supabase";
import { cached, CacheTtl } from "../lib/cache";
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
};

export function Leaderboard({ onBack: _onBack, onOpenCollection }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await cached(
        "leaderboard:top",
        CacheTtl.leaderboard,
        async () => {
          const { data, error: err } = await supabase
            .from("profiles")
            .select(
              "id, username, coins_earned, avatar_card_id, avatar_zoom, avatar_x, avatar_y",
            )
            .order("coins_earned", { ascending: false })
            .limit(100);

          if (err) throw new Error(err.message);
          return (data ?? []).map((r) => ({
            id: String(r.id),
            username: String(r.username ?? "Player"),
            coins_earned: Number(r.coins_earned) || 0,
            avatar: normalizeAvatarCrop({
              cardId: r.avatar_card_id ?? null,
              zoom: r.avatar_zoom ?? DEFAULT_AVATAR_CROP.zoom,
              x: r.avatar_x ?? DEFAULT_AVATAR_CROP.x,
              y: r.avatar_y ?? DEFAULT_AVATAR_CROP.y,
            }),
          }));
        },
        { force },
      );
      setRows(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="board-page">
      <PageHeader
        eyebrow="Players"
        title="Leaderboard"
        blurb="Lifetime Cash earned · tap a player to view cards"
      />
      <main className="board-main">
        <div className="board-toolbar">
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
        ) : rows.length === 0 ? (
          <p className="board-status">No accounts yet.</p>
        ) : (
          <table className="board-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Earned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const mine = user?.id === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`board-table__row${mine ? " is-you" : ""}`}
                  >
                    <td>{i + 1}</td>
                    <td>
                      <button
                        type="button"
                        className="board-table__player"
                        onClick={() =>
                          onOpenCollection({
                            userId: row.id,
                            username: row.username,
                          })
                        }
                      >
                        <UserAvatar crop={row.avatar} size={56} />
                        <span>
                          {row.username}
                          {mine ? " (you)" : ""}
                        </span>
                      </button>
                    </td>
                    <td>{row.coins_earned.toLocaleString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
