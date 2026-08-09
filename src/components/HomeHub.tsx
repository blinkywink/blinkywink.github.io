import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";
import { cached, CacheTtl } from "../lib/cache";
import {
  fetchMarketplaceListings,
  type MarketplaceListing,
} from "../lib/marketplace";
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
import { ArcadeHome } from "./ArcadeHome";
import { BoosterPack } from "./BoosterPack";
import { CashAmount } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";
import { UserAvatar } from "./UserAvatar";

type BoardRow = {
  id: string;
  username: string;
  coins_earned: number;
  avatar: AvatarCrop;
};

/** Site hub — one compact row per area. */
export function HomeHub() {
  const navigate = useNavigate();
  const featured = useMemo(() => featuredShopPacks(), []);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [topPlayers, setTopPlayers] = useState<BoardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchMarketplaceListings();
        if (!cancelled) setListings(rows.slice(0, 6));
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

  const sampleCards = useMemo(() => {
    const ids = [
      "dart-monkey-0-0-0",
      "ninja-monkey-5-0-0",
      "super-monkey-0-5-0",
      "wizard-monkey-5-0-0",
      "bomb-shooter-0-5-0",
      "ice-monkey-paragon",
    ];
    return ids.map((id) => cardSpecById(id)).filter(Boolean);
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
      </section>

      <section className="home-hub__section" aria-labelledby="hub-shop">
        <div className="home-hub__head">
          <h2 id="hub-shop">Shop</h2>
          <Link to={shopPath()}>Open shop →</Link>
        </div>
        <div className="home-hub__row home-hub__row--packs">
          {featured.map((pack) => (
            <HubPackButton key={pack.id} pack={pack} />
          ))}
        </div>
      </section>

      <section className="home-hub__section" aria-labelledby="hub-cards">
        <div className="home-hub__head">
          <h2 id="hub-cards">Cards</h2>
          <Link to={collectionPath()}>Collection →</Link>
        </div>
        <div className="home-hub__row home-hub__row--cards">
          {sampleCards.map((card) =>
            card ? (
              <div key={card.id} className="home-hub__card-cell">
                <MonkeyCard
                  entity={card.entity}
                  pathLevels={card.pathLevels}
                  mode="preview"
                  owned
                  onSelect={() => navigate(collectionPath())}
                />
              </div>
            ) : null,
          )}
        </div>
      </section>

      <section className="home-hub__section" aria-labelledby="hub-market">
        <div className="home-hub__head">
          <h2 id="hub-market">Market</h2>
          <Link to={marketplacePath()}>Browse →</Link>
        </div>
        {listings.length === 0 ? (
          <p className="home-hub__note">No active listings right now.</p>
        ) : (
          <div className="home-hub__row home-hub__row--cards">
            {listings.map((row) => {
              const card = cardSpecById(row.cardId);
              const open = () => navigate(listingPath(row.id));
              return (
                <article key={row.id} className="home-hub__card-cell">
                  {card ? (
                    <MonkeyCard
                      entity={card.entity}
                      pathLevels={card.pathLevels}
                      mode="preview"
                      owned
                      onSelect={open}
                    />
                  ) : (
                    <button
                      type="button"
                      className="market-card__missing"
                      onClick={open}
                    >
                      {row.cardId}
                    </button>
                  )}
                  <button
                    type="button"
                    className="home-hub__price"
                    onClick={open}
                  >
                    <CashAmount amount={row.price} size={15} />
                  </button>
                  <Link
                    className="home-hub__seller"
                    to={userCollectionPath(row.sellerUsername)}
                  >
                    <UserAvatar crop={row.sellerAvatar} size={22} />
                    <span>{row.sellerUsername}</span>
                  </Link>
                </article>
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

function HubPackButton({ pack }: { pack: PackDef }) {
  const navigate = useNavigate();
  const price = packPrice(pack);
  return (
    <button
      type="button"
      className="pack-shelf__item home-hub__pack-item"
      onClick={() => navigate(shopPath())}
    >
      <BoosterPack
        pack={pack}
        effects={false}
        className="pack-shelf__booster"
      />
      <span className="pack-shelf__label">
        <strong>{pack.title}</strong>
        <span className="pack-shelf__price">
          <img
            src="/images/ui/money-icon.webp"
            alt=""
            width={22}
            height={22}
          />
          {price.toLocaleString()}
        </span>
      </span>
    </button>
  );
}
