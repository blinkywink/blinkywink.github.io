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
import {
  allCategoryPacks,
  featuredShopPacks,
  packPrice,
  type PackDef,
} from "../lib/packTheme";
import { formatPathLevels, maxPathTier } from "../lib/pathCombos";
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

function formatPostedAt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Site hub — expanded peeks that match each real page. */
export function HomeHub() {
  const navigate = useNavigate();
  const featured = useMemo(() => featuredShopPacks(), []);
  const categories = useMemo(() => allCategoryPacks(), []);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [topPlayers, setTopPlayers] = useState<BoardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchMarketplaceListings();
        if (!cancelled) setListings(rows.slice(0, 8));
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
              .limit(10);
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
      "dart-monkey-000",
      "ninja-monkey-5-0-0",
      "super-monkey-0-5-0",
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
          onPlay={(game) => navigate(gamePath(game as GamePath))}
        />
      </section>

      <section className="home-hub__section" aria-labelledby="hub-shop">
        <div className="home-hub__head">
          <h2 id="hub-shop">Shop</h2>
          <Link to={shopPath()}>Open shop →</Link>
        </div>
        <div className="pack-shelf pack-shelf--hub">
          <div className="pack-shelf__head">
            <h3 className="section-label">Featured</h3>
          </div>
          <div className="pack-shelf__row">
            {featured.map((pack) => (
              <HubPackButton key={pack.id} pack={pack} />
            ))}
          </div>
          <div className="pack-shelf__head pack-shelf__head--sub">
            <h3 className="section-label">Categories</h3>
          </div>
          <div className="pack-shelf__row">
            {categories.map((pack) => (
              <HubPackButton key={pack.id} pack={pack} />
            ))}
          </div>
        </div>
      </section>

      <section className="home-hub__section" aria-labelledby="hub-cards">
        <div className="home-hub__head">
          <h2 id="hub-cards">Cards</h2>
          <Link to={collectionPath()}>Collection →</Link>
        </div>
        <div className="card-lab__grid home-hub__card-grid">
          {sampleCards.map((card) =>
            card ? (
              <MonkeyCard
                key={card.id}
                entity={card.entity}
                pathLevels={card.pathLevels}
                mode="preview"
                owned
                onSelect={() => navigate(collectionPath())}
              />
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
          <div className="market-grid home-hub__market-grid">
            {listings.map((row) => {
              const card = cardSpecById(row.cardId);
              const open = () => navigate(listingPath(row.id));
              const tier = card ? maxPathTier(card.pathLevels) : 0;
              const pathLabel = card
                ? formatPathLevels(card.pathLevels)
                : "";
              return (
                <article key={row.id} className="market-card">
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
                  <div className="market-card__meta">
                    <div className="market-card__price-row">
                      <button
                        type="button"
                        className="market-card__price"
                        onClick={open}
                      >
                        <CashAmount amount={row.price} size={16} />
                      </button>
                      <span className="market-card__time">
                        {formatPostedAt(row.createdAt)}
                      </span>
                    </div>
                    {card ? (
                      <p className="home-hub__listing-sub">
                        {card.tower}
                        {pathLabel ? ` · ${pathLabel}` : ""}
                        {tier ? ` · T${tier}` : ""}
                      </p>
                    ) : null}
                    <Link
                      className="market-card__seller"
                      to={userCollectionPath(row.sellerUsername)}
                    >
                      <UserAvatar crop={row.sellerAvatar} size={28} />
                      <span>{row.sellerUsername}</span>
                    </Link>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm market-card__action"
                      onClick={open}
                    >
                      View
                    </button>
                  </div>
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
          <table className="board-table home-hub__board-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Earned</th>
              </tr>
            </thead>
            <tbody>
              {topPlayers.map((row, i) => (
                <tr key={row.id}>
                  <td>{i + 1}</td>
                  <td>
                    <Link
                      className="board-table__player"
                      to={userCollectionPath(row.username)}
                    >
                      <UserAvatar crop={row.avatar} size={56} />
                      <span>{row.username}</span>
                    </Link>
                  </td>
                  <td>{row.coins_earned.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
      className="pack-shelf__item"
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
