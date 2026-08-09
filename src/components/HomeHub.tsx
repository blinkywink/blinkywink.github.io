import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";
import { cached, CacheTtl } from "../lib/cache";
import { fetchMarketplaceListings } from "../lib/marketplace";
import {
  collectionPath,
  gamePath,
  gamesPath,
  leaderboardPath,
  listingPath,
  marketplacePath,
  shopPath,
  userCollectionPath,
  type GamePath,
} from "../lib/routes";
import { featuredShopPacks, packPrice, type PackDef } from "../lib/packTheme";
import { supabase } from "../lib/supabase";
import { BoosterPack } from "./BoosterPack";
import { CashAmount } from "./CurrencyChip";
import { UserAvatar } from "./UserAvatar";

const GAMES: { id: GamePath; title: string; blurb: string }[] = [
  { id: "zoomed", title: "Zoomed", blurb: "Guess the tower" },
  { id: "geoguessr", title: "Geoguessr", blurb: "Guess the map" },
  { id: "pricecheck", title: "Price Check", blurb: "Which costs more?" },
  { id: "orderup", title: "Order Up", blurb: "Sort by price" },
  { id: "bloonle", title: "Bloonle", blurb: "Daily tower Wordle" },
];

type BoardRow = {
  id: string;
  username: string;
  coins_earned: number;
  avatar: AvatarCrop;
};

/** Site hub — one line of what this is, plus peeks at each area. */
export function HomeHub() {
  const packs = useMemo(() => featuredShopPacks().slice(0, 4), []);
  const [listings, setListings] = useState<
    Awaited<ReturnType<typeof fetchMarketplaceListings>>
  >([]);
  const [topPlayers, setTopPlayers] = useState<BoardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchMarketplaceListings();
        if (!cancelled) setListings(rows.slice(0, 4));
      } catch {
        if (!cancelled) setListings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      <header className="home-hub__hero">
        <p className="home-hub__word">Arcade.</p>
        <p className="home-hub__line">
          Play BTD6 minigames, pull packs, collect cards, trade & sell.
        </p>
      </header>

      <section className="home-hub__section" aria-labelledby="hub-games">
        <div className="home-hub__head">
          <h2 id="hub-games">Games</h2>
          <Link to={gamesPath()}>All games →</Link>
        </div>
        <div className="home-hub__games">
          {GAMES.map((g) => (
            <Link key={g.id} to={gamePath(g.id)} className="home-hub__game">
              <strong>{g.title}</strong>
              <span>{g.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-hub__section" aria-labelledby="hub-shop">
        <div className="home-hub__head">
          <h2 id="hub-shop">Shop</h2>
          <Link to={shopPath()}>Open shop →</Link>
        </div>
        <div className="home-hub__packs">
          {packs.map((pack) => (
            <HubPack key={pack.id} pack={pack} />
          ))}
        </div>
      </section>

      <section className="home-hub__section" aria-labelledby="hub-cards">
        <div className="home-hub__head">
          <h2 id="hub-cards">Cards</h2>
          <Link to={collectionPath()}>Collection →</Link>
        </div>
        <p className="home-hub__note">
          Unlock tower cards from packs and games — browse your full collection
          anytime.
        </p>
      </section>

      <section className="home-hub__section" aria-labelledby="hub-market">
        <div className="home-hub__head">
          <h2 id="hub-market">Market</h2>
          <Link to={marketplacePath()}>Browse →</Link>
        </div>
        {listings.length === 0 ? (
          <p className="home-hub__note">No active listings right now.</p>
        ) : (
          <div className="home-hub__market">
            {listings.map((row) => {
              const card = cardSpecById(row.cardId);
              return (
                <Link
                  key={row.id}
                  to={listingPath(row.id)}
                  className="home-hub__listing"
                >
                  {card ? (
                    <img src={card.entity.image} alt="" draggable={false} />
                  ) : (
                    <span className="home-hub__listing-ph" />
                  )}
                  <span className="home-hub__listing-meta">
                    <strong>{card?.entity.name ?? "Card"}</strong>
                    <CashAmount amount={row.price} size={15} />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="home-hub__section" aria-labelledby="hub-board">
        <div className="home-hub__head">
          <h2 id="hub-board">Players</h2>
          <Link to={leaderboardPath()}>Leaderboard →</Link>
        </div>
        {topPlayers.length === 0 ? (
          <p className="home-hub__note">Leaderboard loading…</p>
        ) : (
          <ol className="home-hub__board">
            {topPlayers.map((row, i) => (
              <li key={row.id}>
                <Link
                  to={userCollectionPath(row.username)}
                  className="home-hub__player"
                >
                  <span className="home-hub__rank">{i + 1}</span>
                  <UserAvatar crop={row.avatar} size={36} />
                  <strong>{row.username}</strong>
                  <CashAmount amount={row.coins_earned} size={14} />
                </Link>
              </li>
            ))}
          </ol>
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

function HubPack({ pack }: { pack: PackDef }) {
  const price = packPrice(pack);
  return (
    <Link to={shopPath()} className="home-hub__pack">
      <BoosterPack pack={pack} effects={false} className="home-hub__booster" />
      <span className="home-hub__pack-label">
        <strong>{pack.title}</strong>
        <CashAmount amount={price} size={15} />
      </span>
    </Link>
  );
}
