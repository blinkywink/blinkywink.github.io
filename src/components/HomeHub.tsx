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
import { isDesktopShell } from "../lib/desktopOnline";
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
                "id, username, coins_earned, avatar_card_id, avatar_zoom, avatar_x, avatar_y, accent_color",
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
          pick={["zoomed", "bloonle", "bananacatch"]}
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

      {!isDesktopShell() ? (
        <section
          className="home-hub__section home-hub__section--download"
          aria-labelledby="hub-download"
        >
          <div className="home-hub__download">
            <p id="hub-download" className="home-hub__download-copy">
              Download for Mac or Windows for faster loading times.
            </p>
            <div className="home-hub__download-actions">
              <button
                type="button"
                className="home-hub__download-btn home-hub__download-btn--mac"
                aria-label="Download for Mac (coming soon)"
              >
                <svg viewBox="0 0 24 24" aria-hidden focusable="false">
                  <path d="M16.13 12.87c-.02-2.17 1.77-3.21 1.85-3.26-1.01-1.47-2.58-1.67-3.13-1.7-1.33-.14-2.6.78-3.28.78-.68 0-1.73-.76-2.85-.74-1.47.02-2.82.85-3.58 2.16-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.85.69 1.18-.02 1.93-1.07 2.65-2.12.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.45zm-2.17-6.3c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.33-.56.65-1.05 1.69-.92 2.69.97.08 1.96-.49 2.58-1.22z" />
                </svg>
                Mac
              </button>
              <button
                type="button"
                className="home-hub__download-btn home-hub__download-btn--win"
                aria-label="Download for Windows (coming soon)"
              >
                <svg viewBox="0 0 24 24" aria-hidden focusable="false">
                  <path d="M3 5.5 10.5 4.2v7.4H3V5.5zm0 13V12.8h7.5v7.5L3 18.5zm9-11.3L21 3.8v8.9H12V7.2zm0 13.3V12.8H21v8.4l-9 1.3z" />
                </svg>
                Windows
              </button>
            </div>
          </div>
        </section>
      ) : null}

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
