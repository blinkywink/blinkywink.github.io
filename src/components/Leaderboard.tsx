import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { GameHeader } from "./GameHeader";

type Props = {
  onBack: () => void;
};

type Row = {
  id: string;
  username: string;
  coins_earned: number;
};

export function Leaderboard({ onBack: _onBack }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("profiles")
      .select("id, username, coins_earned")
      .order("coins_earned", { ascending: false })
      .limit(100);

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(
        (data ?? []).map((r) => ({
          id: String(r.id),
          username: String(r.username ?? "Player"),
          coins_earned: Number(r.coins_earned) || 0,
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="board-page">
      <GameHeader title="LEADERBOARD" icon="" />
      <main className="board-main">
        <p className="board-sub">Lifetime Cash earned</p>

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
                  <tr key={row.id} className={mine ? "is-you" : undefined}>
                    <td>{i + 1}</td>
                    <td>
                      {row.username}
                      {mine ? " (you)" : ""}
                    </td>
                    <td>{row.coins_earned.toLocaleString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      </main>
    </div>
  );
}
