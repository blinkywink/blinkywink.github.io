import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";
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
import {
  featuredShopPacks,
  resolveTowerPackTheme,
  type PackDef,
} from "../lib/packTheme";
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

const CARD_PEEK_IDS = [
  "dart-monkey-0-0-0",
  "ninja-monkey-5-0-0",
  "super-monkey-0-5-0",
] as const;

function packPeekImage(pack: PackDef): string {
  if (pack.coverArt) return pack.coverArt;
  if (pack.tower) {
    const theme = resolveTowerPackTheme(pack.tower);
    if (theme?.image) return theme.image;
  }
  return "/images/ui/monkey-pack.jpg";
}

/** Site hub — games up top, feature tiles below. */
export function HomeHub() {
  const navigate = useNavigate();
  const [topPlayers, setTopPlayers] = useState<BoardRow[]>([]);
  const shopPeeks = useMemo(() => featuredShopPacks().slice(0, 3), []);
  const cardPeeks = useMemo(
    () =>
      CARD_PEEK_IDS.map((id) => cardSpecById(id)).filter(
        (c): c is NonNullable<typeof c> => Boolean(c),
      ),
    [],
  );

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
          <Link to={shopPath()} className="home-hub__dest home-hub__dest--shop">
            <div className="home-hub__dest-visual" aria-hidden>
              <div className="home-hub__pack-spread">
                {shopPeeks.map((pack, i) => (
                  <span
                    key={pack.id}
                    className={`home-hub__pack-peek is-${i}`}
                    style={
                      {
                        "--peek-img": `url(${packPeekImage(pack)})`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
            <div className="home-hub__dest-copy">
              <strong>Shop</strong>
              <span>Open packs with Cash — new cards every pull.</span>
            </div>
          </Link>

          <Link
            to={collectionPath()}
            className="home-hub__dest home-hub__dest--cards"
          >
            <div className="home-hub__dest-visual" aria-hidden>
              <div className="home-hub__card-spread">
                {cardPeeks.map((card, i) => (
                  <span key={card.id} className={`home-hub__card-peek is-${i}`}>
                    <img src={card.entity.image} alt="" draggable={false} />
                  </span>
                ))}
              </div>
            </div>
            <div className="home-hub__dest-copy">
              <strong>Cards</strong>
              <span>Your collection — every tower, path, and paragon.</span>
            </div>
          </Link>

          <Link
            to={marketplacePath()}
            className="home-hub__dest home-hub__dest--market"
          >
            <div className="home-hub__dest-visual" aria-hidden>
              <div className="home-hub__market-actions">
                <span className="home-hub__market-btn is-buy">Buy</span>
                <span className="home-hub__market-btn is-sell">Sell</span>
              </div>
            </div>
            <div className="home-hub__dest-copy">
              <strong>Market</strong>
              <span>List extras for Cash or snag cards from other players.</span>
            </div>
          </Link>
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
