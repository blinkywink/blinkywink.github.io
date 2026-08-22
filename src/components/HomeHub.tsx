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
  aboutPath,
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
import {
  getRemoteFeaturedTowers,
  subscribeRemoteFeatured,
} from "../lib/remoteShop";
import { isDesktopShell } from "../lib/desktopOnline";
import {
  DISCORD_INVITE_URL,
  YOUTUBE_CHANNEL_URL,
} from "../lib/openExternal";
import { useAuth } from "../auth/AuthProvider";
import { ArcadeHome } from "./ArcadeHome";
import { DesktopDownloadButtons } from "./DesktopDownloadButtons";
import { ExternalLink } from "./ExternalLink";
import { HowToPlayOverlay } from "./HowToPlayOverlay";
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

const HOWTO_OPEN_KEY = "ba:howto-open";

function readHowtoOpen(): boolean {
  try {
    return sessionStorage.getItem(HOWTO_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHowtoOpen(open: boolean) {
  try {
    if (open) sessionStorage.setItem(HOWTO_OPEN_KEY, "1");
    else sessionStorage.removeItem(HOWTO_OPEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Site hub. Games up top, feature tiles below. */
export function HomeHub() {
  const navigate = useNavigate();
  const { ready, user, isGuest } = useAuth();
  const [howtoOpen, setHowtoOpen] = useState(readHowtoOpen);
  const [topPlayers, setTopPlayers] = useState<
    Awaited<ReturnType<typeof fetchTopLeaderboard>>
  >([]);
  const [remoteTowers, setRemoteTowers] = useState(getRemoteFeaturedTowers);
  useEffect(
    () => subscribeRemoteFeatured(() => setRemoteTowers(getRemoteFeaturedTowers())),
    [],
  );
  const shopPeeks = useMemo(
    () => featuredShopPacks(undefined, 0, remoteTowers ?? undefined).slice(0, 3),
    [remoteTowers],
  );
  const cardPeeks = useMemo(
    () =>
      CARD_PEEK_IDS.map((id) => cardSpecById(id)).filter(
        (c): c is NonNullable<typeof c> => Boolean(c),
      ),
    [],
  );

  const showHowtoBtn = ready && (isGuest || !user);

  useEffect(() => {
    writeHowtoOpen(howtoOpen);
  }, [howtoOpen]);

  useEffect(() => {
    let cancelled = false;
    const load = async (force = false) => {
      try {
        const rows = (
          await fetchTopLeaderboard(force, {
            revalidate: !force,
            onRevalidate: (fresh) => {
              if (!cancelled) setTopPlayers(fresh.slice(0, 5));
            },
          })
        ).slice(0, 5);
        if (!cancelled) setTopPlayers(rows);
      } catch {
        if (!cancelled) setTopPlayers([]);
      }
    };
    void load();
    const id = window.setInterval(() => void load(false), 45_000);
    const onWake = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  return (
    <div className="home-hub">
      <div className="home-hub__atmosphere" aria-hidden />

      {showHowtoBtn ? (
        <div className="home-hub__howto-bar">
          <button
            type="button"
            className="home-hub__howto-btn"
            onClick={() => setHowtoOpen(true)}
          >
            How to play
          </button>
        </div>
      ) : null}

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
              Download for Windows or Mac for faster loading times.
            </p>
            <DesktopDownloadButtons />
          </div>
        </section>
      ) : null}

      <footer className="arcade__footer">
        <p className="arcade__footer-links">
          <span>
            made by:{" "}
            <ExternalLink href={YOUTUBE_CHANNEL_URL}>blinkywink</ExternalLink>
          </span>
          <Link to={aboutPath()} className="arcade__footer-link">
            About
          </Link>
          <ExternalLink href={DISCORD_INVITE_URL}>Join the discord</ExternalLink>
        </p>
        <p>BTD6 Creator code: blinky</p>
        <p className="arcade__footer-disclaimer">
          Not affiliated with Ninja Kiwi. This is a fan project. I am not selling
          anything — it is a free game.
        </p>
      </footer>

      <HowToPlayOverlay open={howtoOpen} onClose={() => setHowtoOpen(false)} />
    </div>
  );
}
