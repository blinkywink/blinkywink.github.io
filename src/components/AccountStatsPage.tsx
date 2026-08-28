import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import {
  EMPTY_ACCOUNT_STATS,
  favoriteGameFromStats,
  fetchAccountStats,
  fetchPublicAccountStats,
  statsFromProfile,
  type AccountStats,
} from "../lib/accountStats";
import { fetchPublicPlayerPage } from "../lib/playerPage";
import { ALL_TOWER_SPECS } from "../lib/towerCollection";
import {
  normalizeOwnedHeroIds,
  shoppableHeroes,
} from "../lib/profileHeroes";
import { CashAmount } from "./CurrencyChip";
import { LoadingDots } from "./LoadingDots";

type StatRow = {
  label: string;
  value: ReactNode;
  note?: string;
};

type LiveCounts = {
  cardsOwned: number;
  cardsTotal: number;
  paragonsOwned: number;
  paragonsTotal: number;
  degree100: number;
  heroesOwned: number;
  heroesTotal: number;
  cashEarned: number;
  shopSpent: number;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function liveFromOwned(
  ownedIds: ReadonlySet<string> | readonly string[],
  degreeOf: (cardId: string) => number,
  heroIds: readonly string[],
  cashEarned: number,
  shopSpent: number,
): LiveCounts {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds);
  const allParagons = ALL_TOWER_SPECS.filter((c) => c.isParagon);
  let paragonsOwned = 0;
  let degree100 = 0;
  for (const card of allParagons) {
    if (!owned.has(card.id)) continue;
    paragonsOwned += 1;
    if (degreeOf(card.id) >= 100) degree100 += 1;
  }
  const heroes = shoppableHeroes();
  const ownedHeroes = new Set(normalizeOwnedHeroIds(heroIds));
  return {
    cardsOwned: owned.size,
    cardsTotal: ALL_TOWER_SPECS.length,
    paragonsOwned,
    paragonsTotal: allParagons.length,
    degree100,
    heroesOwned: ownedHeroes.size,
    heroesTotal: heroes.length,
    cashEarned: Math.max(0, Math.floor(cashEarned)),
    shopSpent: Math.max(0, Math.floor(shopSpent)),
  };
}

function rowsFor(
  stats: AccountStats,
  live: LiveCounts,
): { title: string; rows: StatRow[] }[] {
  const fav = favoriteGameFromStats(stats);
  const winRate =
    stats.gamesPlayed > 0
      ? `${Math.round((stats.gamesWon / stats.gamesPlayed) * 100)}%`
      : "—";

  return [
    {
      title: "Packs",
      rows: [
        { label: "Packs opened", value: fmt(stats.packsOpened) },
        { label: "Packs purchased", value: fmt(stats.packsPurchased) },
        { label: "Cards pulled", value: fmt(stats.cardsPulled) },
        { label: "Paragons pulled", value: fmt(stats.paragonsPulled) },
      ],
    },
    {
      title: "Collection",
      rows: [
        {
          label: "Cards owned",
          value: `${fmt(live.cardsOwned)} / ${fmt(live.cardsTotal)}`,
          note:
            live.cardsTotal > 0
              ? `${Math.round((live.cardsOwned / live.cardsTotal) * 100)}% complete`
              : undefined,
        },
        {
          label: "Paragons owned",
          value: `${fmt(live.paragonsOwned)} / ${fmt(live.paragonsTotal)}`,
        },
        { label: "Degree 100 paragons", value: fmt(live.degree100) },
        {
          label: "Heroes unlocked",
          value: `${fmt(live.heroesOwned)} / ${fmt(live.heroesTotal)}`,
        },
      ],
    },
    {
      title: "Games",
      rows: [
        { label: "Games played", value: fmt(stats.gamesPlayed) },
        { label: "Games won", value: fmt(stats.gamesWon) },
        { label: "Win rate", value: winRate },
        {
          label: "Favorite game",
          value: fav ? fav.label : "None yet",
          note: fav ? `${fmt(fav.plays)} plays` : undefined,
        },
      ],
    },
    {
      title: "Trading",
      rows: [
        { label: "Trades completed", value: fmt(stats.tradesCompleted) },
        { label: "Exchanges completed", value: fmt(stats.exchangesCompleted) },
      ],
    },
    {
      title: "Cash",
      rows: [
        {
          label: "Lifetime earned",
          value: <CashAmount amount={live.cashEarned} size={22} />,
        },
        {
          label: "Shop spent",
          value: <CashAmount amount={live.shopSpent} size={22} />,
        },
      ],
    },
  ];
}

export function AccountStatsPage() {
  const { username: usernameParam } = useParams();
  const remoteUsername = String(usernameParam ?? "").trim() || null;
  const { ready, isGuest, profile, user } = useAuth();
  const { owned, paragonOf } = useCardCollection();
  const viewingSelf =
    !remoteUsername ||
    (user?.username != null &&
      user.username.toLowerCase() === remoteUsername.toLowerCase());

  const [stats, setStats] = useState<AccountStats>(() =>
    viewingSelf
      ? statsFromProfile(profile?.account_stats)
      : { ...EMPTY_ACCOUNT_STATS, gamePlays: {} },
  );
  const [live, setLive] = useState<LiveCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);

    void (async () => {
      if (viewingSelf) {
        const next = await fetchAccountStats();
        if (cancelled) return;
        setStats(next);
        setLoading(false);
        return;
      }

      const [bundle, page] = await Promise.all([
        fetchPublicAccountStats(remoteUsername!),
        fetchPublicPlayerPage(remoteUsername!, { force: true }),
      ]);
      if (cancelled) return;
      if (!bundle || !page) {
        setMissing(true);
        setLoading(false);
        return;
      }
      setStats(bundle.stats);
      setLive(
        liveFromOwned(
          page.ownedIds,
          (id) => page.paragons[id]?.degree ?? 1,
          bundle.ownedHeroIds,
          bundle.coinsEarned,
          bundle.shopSpent,
        ),
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [viewingSelf, remoteUsername]);

  useEffect(() => {
    if (!viewingSelf || loading) return;
    setStats(statsFromProfile(profile?.account_stats));
  }, [viewingSelf, loading, profile?.account_stats]);

  useEffect(() => {
    if (!viewingSelf || loading) return;
    setLive(
      liveFromOwned(
        owned,
        (id) => paragonOf(id)?.degree ?? 1,
        normalizeOwnedHeroIds(profile?.owned_hero_ids),
        profile?.coins_earned ?? 0,
        profile?.shop_spent ?? 0,
      ),
    );
  }, [
    viewingSelf,
    loading,
    owned,
    paragonOf,
    profile?.coins_earned,
    profile?.owned_hero_ids,
    profile?.shop_spent,
  ]);

  const title = useMemo(() => {
    if (viewingSelf) return "Account stats";
    return `${remoteUsername}'s stats`;
  }, [viewingSelf, remoteUsername]);

  const sections = live ? rowsFor(stats, live) : [];

  return (
    <div className="account-stats-page">
      <header className="account-stats-page__head">
        <h1>{title}</h1>
      </header>

      {!ready || loading ? (
        <LoadingDots label="Loading stats" />
      ) : missing ? (
        <p className="account-stats-page__guest">Player not found.</p>
      ) : (
        <div className="account-stats-page__grid" aria-label="Stats">
          {viewingSelf && isGuest ? (
            <p className="account-stats-page__guest">
              Guest stats stay on this device. Sign in to sync across devices.
            </p>
          ) : null}
          {sections.map((section) => (
            <section
              key={section.title}
              className="account-stats-page__section"
              aria-label={section.title}
            >
              <h2 className="account-stats-page__section-title">
                {section.title}
              </h2>
              <ul className="account-stats-page__list">
                {section.rows.map((row) => (
                  <li key={row.label} className="account-stats-page__item">
                    <span className="account-stats-page__label">
                      {row.label}
                    </span>
                    <strong className="account-stats-page__value">
                      {row.value}
                    </strong>
                    {row.note ? (
                      <span className="account-stats-page__note">
                        {row.note}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
