import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
import { UserAvatar } from "./UserAvatar";
import {
  hasPlayerChrome,
  normalizeAccentColor,
  playerChromeStyle,
} from "../lib/profileCosmetics";

type BoardRow = {
  id: string;
  username: string;
  coins_earned: number;
  avatar: AvatarCrop;
  accentColor: string | null;
  auraCardId: string | null;
};

const CARD_PEEK_IDS = [
  "dart-monkey-0-0-0",
  "ninja-monkey-5-0-0",
  "super-monkey-0-5-0",
] as const;

function packPeekSrc(pack: PackDef): string {
  if (pack.coverArt) return pack.coverArt;
  if (pack.tower) {
    return resolveTowerPackTheme(pack.tower)?.image ?? "/images/ui/monkey-pack.jpg";
  }
  return "/images/ui/monkey-pack.jpg";
}

function DestTile({
  to,
  tone,
  title,
  blurb,
  children,
}: {
  to: string;
  tone: "shop" | "cards" | "market";
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const go = () => navigate(to);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };

  return (
    <div
      className={`home-hub__dest home-hub__dest--${tone}`}
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={onKeyDown}
    >
      <div className="home-hub__dest-visual" aria-hidden>
        {children}
      </div>
      <div className="home-hub__dest-copy">
        <strong>{title}</strong>
        <span>{blurb}</span>
      </div>
    </div>
  );
}

/** Site hub. Games up top, feature tiles below. */
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
                "id, username, coins_earned, avatar_card_id, avatar_zoom, avatar_x, avatar_y, accent_color, aura_card_id",
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
              accentColor: normalizeAccentColor(r.accent_color),
              auraCardId: r.aura_card_id ? String(r.aura_card_id) : null,
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
          <DestTile
            to={shopPath()}
            tone="shop"
            title="Shop"
            blurb="Open packs with Cash."
          >
            <div className="home-hub__img-spread home-hub__img-spread--packs">
              {shopPeeks.map((pack, i) => (
                <img
                  key={pack.id}
                  className={`home-hub__img-peek is-pack is-${i}`}
                  src={packPeekSrc(pack)}
                  alt=""
                  draggable={false}
                  decoding="async"
                />
              ))}
            </div>
          </DestTile>

          <DestTile
            to={collectionPath()}
            tone="cards"
            title="Cards"
            blurb="Browse your collection."
          >
            <div className="home-hub__img-spread home-hub__img-spread--cards">
              {cardPeeks.map((card, i) => (
                <img
                  key={card.id}
                  className={`home-hub__img-peek is-card is-${i}`}
                  src={card.entity.image}
                  alt=""
                  draggable={false}
                  decoding="async"
                />
              ))}
            </div>
          </DestTile>

          <DestTile
            to={marketplacePath()}
            tone="market"
            title="Market"
            blurb="Buy and sell cards with other players."
          >
            <div className="home-hub__market-actions">
              <span className="home-hub__market-btn is-buy">Buy</span>
              <span className="home-hub__market-btn is-sell">Sell</span>
            </div>
          </DestTile>
        </div>
      </section>

      <section className="home-hub__section" aria-labelledby="hub-board">
        <div className="home-hub__head">
          <h2 id="hub-board">Top players</h2>
          <Link to={leaderboardPath()}>Leaderboard →</Link>
        </div>
        {topPlayers.length === 0 ? (
          <p className="home-hub__note">Leaderboard loading…</p>
        ) : (
          <div className="home-hub__row home-hub__row--players">
            {topPlayers.map((row, i) => {
              const chrome = playerChromeStyle({
                accentColor: row.accentColor,
                auraCardId: row.auraCardId,
              });
              const chromeOn = hasPlayerChrome(chrome);
              return (
                <Link
                  key={row.id}
                  className={`home-hub__player-chip${chromeOn ? " has-player-chrome" : ""}`}
                  style={chromeOn ? chrome : undefined}
                  to={userCollectionPath(row.username)}
                >
                  <span className="home-hub__rank">{i + 1}</span>
                  <UserAvatar crop={row.avatar} size={36} />
                  <strong>{row.username}</strong>
                </Link>
              );
            })}
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
