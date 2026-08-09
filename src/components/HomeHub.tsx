import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "../lib/avatar";
import { cached, CacheTtl } from "../lib/cache";
import {
  collectionPath,
  gamePath,
  gamesPath,
  leaderboardPath,
  marketplacePath,
  shopPath,
  userCollectionPath,
  type GamePath,
} from "../lib/routes";
import { supabase } from "../lib/supabase";
import { ArcadeHome } from "./ArcadeHome";
import { CashAmount } from "./CurrencyChip";
import { UserAvatar } from "./UserAvatar";

type BoardRow = {
  id: string;
  username: string;
  coins_earned: number;
  avatar: AvatarCrop;
};

const DESTINATIONS = [
  {
    to: shopPath(),
    title: "Shop",
    blurb: "Buy packs with Cash",
    tone: "shop",
  },
  {
    to: collectionPath(),
    title: "Cards",
    blurb: "Browse your collection",
    tone: "cards",
  },
  {
    to: marketplacePath(),
    title: "Market",
    blurb: "Trade with players",
    tone: "market",
  },
] as const;

/** Site hub — games up top, simple links below. */
export function HomeHub() {
  const navigate = useNavigate();
  const [topPlayers, setTopPlayers] = useState<BoardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await cached(
          "leaderboard:top",
          CacheTtl.leaderboard,
          async () => {
            const { data, error } = await supabase
              .from("profiles")
              .select(
                "id, username, coins_earned, avatar_card_id, avatar_zoom, avatar_x, avatar_y",
              )
              .order("coins_earned", { ascending: false })
              .limit(5);
            if (error) throw new Error(error.message);
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
        );
        if (!cancelled) setTopPlayers(rows);
      } catch {
        if (!cancelled) setTopPlayers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="home-hub">
      <div className="home-hub__atmosphere" aria-hidden />

      <section className="home-hub__section" aria-labelledby="hub-games">
        <div className="home-hub__head">
          <h2 id="hub-games">Games</h2>
          <Link to={gamesPath()}>All games →</Link>
        </div>
        <ArcadeHome
          embed
          limit={3}
          onPlay={(game) => navigate(gamePath(game as GamePath))}
        />

        <div className="home-hub__destinations" aria-label="Explore">
          {DESTINATIONS.map((d) => (
            <Link
              key={d.to}
              to={d.to}
              className={`home-hub__dest home-hub__dest--${d.tone}`}
            >
              <strong>{d.title}</strong>
              <span>{d.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-hub__section" aria-labelledby="hub-board">
        <div className="home-hub__head">
          <h2 id="hub-board">Players</h2>
          <Link to={leaderboardPath()}>Leaderboard →</Link>
        </div>
        {topPlayers.length === 0 ? (
          <p className="home-hub__note">Leaderboard loading…</p>
        ) : (
          <div className="home-hub__row home-hub__row--players">
            {topPlayers.map((row, i) => (
              <Link
                key={row.id}
                className="home-hub__player-chip"
                to={userCollectionPath(row.username)}
              >
                <span className="home-hub__rank">{i + 1}</span>
                <UserAvatar crop={row.avatar} size={36} />
                <strong>{row.username}</strong>
                <CashAmount amount={row.coins_earned} size={13} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="arcade__footer">
        <p>
          made by:{" "}
          <a
            href="https://youtube.com/@blinkywink"
            target="_blank"
            rel="noreferrer"
          >
            blinkywink
          </a>
        </p>
        <p>BTD6 Creator code: blinky</p>
      </footer>
    </div>
  );
}
