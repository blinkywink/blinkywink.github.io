import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { cardSpecById } from "../lib/cardCatalog";
import { fetchTopLeaderboard } from "../lib/leaderboardRanks";
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
import { isDesktopShell } from "../lib/desktopOnline";
import {
  DESKTOP_MAC_DMG,
  DESKTOP_WINDOWS_SETUP,
} from "../lib/desktopDownloads";
import { ArcadeHome } from "./ArcadeHome";
import { PlayerBadges } from "./PlayerBadges";
import { UserAvatar } from "./UserAvatar";
import {
  hasPlayerChrome,
  playerChromeStyle,
} from "../lib/profileCosmetics";

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
  const [topPlayers, setTopPlayers] = useState<
    Awaited<ReturnType<typeof fetchTopLeaderboard>>
  >([]);
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
        const rows = (await fetchTopLeaderboard()).slice(0, 5);
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
            {topPlayers.map((row) => {
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
                  <span className="home-hub__rank">{row.rank}</span>
                  <UserAvatar crop={row.avatar} size={36} />
                  <strong>{row.username}</strong>
                  <PlayerBadges
                    rank={row.rank}
                    badgeIds={row.badgeIds}
                    size="sm"
                  />
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
              <a
                href={DESKTOP_MAC_DMG}
                className="home-hub__download-btn home-hub__download-btn--mac"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg viewBox="0 0 24 24" aria-hidden focusable="false">
                  <path d="M16.13 12.87c-.02-2.17 1.77-3.21 1.85-3.26-1.01-1.47-2.58-1.67-3.13-1.7-1.33-.14-2.6.78-3.28.78-.68 0-1.73-.76-2.85-.74-1.47.02-2.82.85-3.58 2.16-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.85.69 1.18-.02 1.93-1.07 2.65-2.12.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.45zm-2.17-6.3c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.33-.56.65-1.05 1.69-.92 2.69.97.08 1.96-.49 2.58-1.22z" />
                </svg>
                Mac
              </a>
              <a
                href={DESKTOP_WINDOWS_SETUP}
                className="home-hub__download-btn home-hub__download-btn--win"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg viewBox="0 0 16 16" aria-hidden focusable="false">
                  <rect x="0" y="0" width="7" height="7" />
                  <rect x="9" y="0" width="7" height="7" />
                  <rect x="0" y="9" width="7" height="7" />
                  <rect x="9" y="9" width="7" height="7" />
                </svg>
                Windows
              </a>
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
