import { useCallback, useEffect, useMemo, useState, lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useCardCollection } from "./auth/CardCollectionProvider";
import { useAuth } from "./auth/AuthProvider";
import { useHeroFx } from "./auth/HeroFxProvider";
import { HeroFxProvider } from "./auth/HeroFxProvider";
import { ArcadeHome, type GameId } from "./components/ArcadeHome";
import { BonusPackPicker } from "./components/BonusPackPicker";
import { CashAmount } from "./components/CurrencyChip";
import { CardLab, type CardsOpenOpts } from "./components/CardLab";
import { HomeHub } from "./components/HomeHub";
import { Leaderboard } from "./components/Leaderboard";
import { ListingPage } from "./components/ListingPage";
import { Marketplace } from "./components/Marketplace";
import { PackOpenerTest } from "./components/PackOpenerTest";
import { ParagonDegreeLab } from "./components/ParagonDegreeLab";
import { ProfilePage } from "./components/ProfilePage";
import { ShopPage } from "./components/ShopPage";
import { SiteHeader } from "./components/SiteHeader";
import { TradeRoom } from "./components/TradeRoom";
import { RouteFallback } from "./components/RouteFallback";
import { DesktopOnlineGate } from "./components/DesktopOnlineGate";
import { DesktopUpdateGate } from "./components/DesktopUpdateGate";
import { LivePlayerSync } from "./components/LivePlayerSync";
import { earnsQuizBonusPack } from "./games/rewards";
import { awardCoins } from "./lib/awardCoins";
import {
  resolveFeaturedBonusGame,
  type FeaturedBonusGame,
} from "./lib/featuredBonus";
import { heroEffectsAtLevel } from "./lib/heroEffects";
import {
  pickRewardTowerPack,
  pickRewardTowerPackChoices,
  type PackDef,
} from "./lib/packTheme";
import { fetchProfileByUsername } from "./lib/profiles";
import { recordHeroClear } from "./lib/profileHeroes";
import { heroById } from "./data/heroes";
import {
  collectionPath,
  gamePath,
  gamesPath,
  leaderboardPath,
  userCollectionPath,
  type GamePath,
} from "./lib/routes";
import type { AvatarCrop } from "./lib/avatar";

const ZoomedGame = lazy(() =>
  import("./games/zoomed").then((m) => ({ default: m.ZoomedGame })),
);
const GeoguessrGame = lazy(() =>
  import("./games/geoguessr").then((m) => ({ default: m.GeoguessrGame })),
);
const PriceCheckGame = lazy(() =>
  import("./games/pricecheck").then((m) => ({ default: m.PriceCheckGame })),
);
const OrderUpGame = lazy(() =>
  import("./games/orderup").then((m) => ({ default: m.OrderUpGame })),
);
const BloonleGame = lazy(() =>
  import("./games/bloonle").then((m) => ({ default: m.BloonleGame })),
);
const CamoDetectionGame = lazy(() =>
  import("./games/camodetection").then((m) => ({ default: m.CamoDetectionGame })),
);
const BloonsSweeperGame = lazy(() =>
  import("./games/bloonssweeper").then((m) => ({ default: m.BloonsSweeperGame })),
);
const BananaCatchGame = lazy(() =>
  import("./games/bananacatch").then((m) => ({ default: m.BananaCatchGame })),
);
const BloonHeroGame = lazy(() =>
  import("./games/bloonhero").then((m) => ({ default: m.BloonHeroGame })),
);

function LazyGame({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

type RewardPackState = {
  pack: PackDef;
  reason: "clear" | "bonus";
};

type CollectionLocationState = CardsOpenOpts | null;

const BLOONLE_BONUS_MAX_TRIES = 3;

function HomePage() {
  return <HomeHub />;
}

function GamesPage() {
  const navigate = useNavigate();
  return (
    <ArcadeHome
      onPlay={(game: GameId) => navigate(gamePath(game as GamePath))}
    />
  );
}

function ShopRoute() {
  const navigate = useNavigate();
  return (
    <ShopPage
      onPackFinished={({ pack, unlocked }) => {
        navigate(collectionPath(), {
          state: {
            tower:
              pack.kind === "tower" ? (pack.tower ?? undefined) : undefined,
            highlightIds: unlocked.map((c) => c.id),
          } satisfies CardsOpenOpts,
        });
      }}
    />
  );
}

function CollectionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = (location.state as CollectionLocationState) ?? null;

  return (
    <CardLab
      initial={initial}
      onBack={() => navigate("/")}
    />
  );
}

function UserCollectionPage() {
  const { username = "" } = useParams();
  const navigate = useNavigate();
  const [viewer, setViewer] = useState<{
    userId: string;
    username: string;
    avatar: AvatarCrop;
    showcaseCardIds: string[];
    accentColor: string | null;
    ownedHeroIds: string[];
    equippedHeroId: string | null;
    heroLevels: Record<string, number>;
    badgeIds: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setViewer(null);
    void fetchProfileByUsername(username)
      .then((profile) => {
        if (cancelled) return;
        if (!profile) {
          setError("Player not found.");
          setLoading(false);
          return;
        }
        setViewer({
          userId: profile.userId,
          username: profile.username,
          avatar: profile.avatar,
          showcaseCardIds: profile.showcaseCardIds,
          accentColor: profile.accentColor,
          ownedHeroIds: profile.ownedHeroIds,
          equippedHeroId: profile.equippedHeroId,
          heroLevels: profile.heroLevels,
          badgeIds: profile.badgeIds,
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load player.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return (
      <div className="card-lab">
        <div className="card-lab__atmosphere" aria-hidden="true" />
        <header className="card-lab__header">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => navigate(leaderboardPath())}
          >
            ← Leaderboard
          </button>
          <div className="card-lab__titles">
            <p className="eyebrow">Collection</p>
            <h1>{username || "Player"}</h1>
            <p className="card-lab__blurb">Loading…</p>
          </div>
        </header>
      </div>
    );
  }

  if (error || !viewer) {
    return (
      <div className="card-lab">
        <div className="card-lab__atmosphere" aria-hidden="true" />
        <header className="card-lab__header">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => navigate(leaderboardPath())}
          >
            ← Leaderboard
          </button>
          <div className="card-lab__titles">
            <p className="eyebrow">Collection</p>
            <h1>{username || "Player"}</h1>
            <p className="card-lab__blurb">{error ?? "Player not found."}</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <CardLab
      viewer={viewer}
      onBack={() => navigate(leaderboardPath())}
    />
  );
}

function LeaderboardPage() {
  const navigate = useNavigate();
  return (
    <Leaderboard
      onBack={() => navigate("/")}
      onOpenCollection={(player) => {
        navigate(userCollectionPath(player.username));
      }}
    />
  );
}

function AppShell() {
  const { owned } = useCardCollection();
  const { setCoinBalance, refreshProfile } = useAuth();
  const { equipped, notifyHeroProc } = useHeroFx();
  const navigate = useNavigate();
  const [rewardPack, setRewardPack] = useState<RewardPackState | null>(null);
  const [bonusChoices, setBonusChoices] = useState<PackDef[] | null>(null);
  const [bonusToast, setBonusToast] = useState<string | null>(null);
  const [showBackToGames, setShowBackToGames] = useState(false);
  const [runCashEarned, setRunCashEarned] = useState(0);

  const creditHeroClear = useCallback(
    async (cleared: boolean) => {
      // Always hit the RPC on clear — don't gate on client `equipped`
      // (stale/null context was silently skipping progress).
      if (!cleared) return;
      const result = await recordHeroClear();
      if (!result) return;
      if (!result.heroId) {
        if (!equipped) {
          notifyHeroProc({
            heroId: "quincy",
            message: "Equip a hero to earn clear XP",
          });
        }
        return;
      }
      await refreshProfile();
      const name = heroById(result.heroId)?.name ?? "Hero";
      if (result.ready) {
        notifyHeroProc({
          heroId: result.heroId,
          message: `${name}: level-up unlocked! Tap to upgrade`,
          openHeroes: true,
        });
      } else if (result.required > 0) {
        notifyHeroProc({
          heroId: result.heroId,
          message: `${name}: ${result.progress}/${result.required} clears`,
        });
      }
    },
    [equipped, notifyHeroProc, refreshProfile],
  );

  const settleFeaturedBonus = useCallback(
    async (game: FeaturedBonusGame, cleared: boolean) => {
      const result = resolveFeaturedBonusGame(game, cleared, {
        silasHoldChance:
          equipped?.heroId === "silas"
            ? heroEffectsAtLevel("silas", equipped.level).featuredFreezeChance
            : 0,
      });
      if (result.silasHeld || result.silasFroze) {
        notifyHeroProc({
          heroId: "silas",
          message: "Silas: featured game held",
        });
      }
      if (!result.awarded || result.amount <= 0) return;
      const balance = await awardCoins(result.amount);
      if (balance != null) setCoinBalance(balance);
      setBonusToast(`+${result.amount.toLocaleString()} featured clear bonus`);
      window.setTimeout(() => setBonusToast(null), 3200);
    },
    [equipped?.heroId, notifyHeroProc, setCoinBalance],
  );

  const finishRewards = useCallback(() => {
    setRewardPack(null);
    setBonusChoices(null);
    setShowBackToGames(true);
  }, []);

  const queueClearAndBonusPacks = useCallback(
    (opts: { cleared: boolean; wantBonus: boolean }) => {
      const free = opts.cleared ? pickRewardTowerPack(owned) : null;
      const exclude = new Set(free?.tower ? [free.tower] : []);
      const choices = opts.wantBonus
        ? pickRewardTowerPackChoices(owned, 3, exclude)
        : [];

      setShowBackToGames(false);

      // Stay on the game route. Pack / picker overlays cover the results UI.
      // Failures with no packs leave the results panel alone.
      if (free) {
        setRewardPack({ pack: free, reason: "clear" });
        setBonusChoices(choices.length ? choices : null);
      } else if (choices.length) {
        setRewardPack(null);
        setBonusChoices(choices);
      } else {
        setRewardPack(null);
        setBonusChoices(null);
      }
    },
    [owned],
  );

  const quizRewardHandlers = useMemo(() => {
    const make =
      (game: FeaturedBonusGame) =>
      (info: {
        cleared: boolean;
        correctCount: number;
        coinsEarned: number;
      }) => {
        setRunCashEarned(info.coinsEarned);
        // Packs / fail state first so we never flash results then yank the route.
        queueClearAndBonusPacks({
          cleared: info.cleared,
          wantBonus: earnsQuizBonusPack(info.correctCount),
        });
        void creditHeroClear(info.cleared);
        void settleFeaturedBonus(game, info.cleared);
      };
    return {
      zoomed: make("zoomed"),
      geoguessr: make("geoguessr"),
      pricecheck: make("pricecheck"),
      orderup: make("orderup"),
      camodetection: make("camodetection"),
    };
  }, [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks]);

  const offerBloonleBonus = useCallback(
    (guesses: number) => {
      if (guesses > BLOONLE_BONUS_MAX_TRIES) return;
      const choices = pickRewardTowerPackChoices(owned, 3);
      if (!choices.length) return;
      setShowBackToGames(false);
      setRewardPack(null);
      setBonusChoices(choices);
    },
    [owned],
  );

  const onBloonleRunEnd = useCallback(
    (info: { cleared: boolean }) => {
      void (async () => {
        await creditHeroClear(info.cleared);
        void settleFeaturedBonus("bloonle", info.cleared);
      })();
    },
    [settleFeaturedBonus, creditHeroClear],
  );

  const onSweeperRunEnd = useCallback(
    (info: { cleared: boolean; coinsEarned: number }) => {
      setRunCashEarned(info.coinsEarned);
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.cleared,
      });
      void creditHeroClear(info.cleared);
      void settleFeaturedBonus("bloonssweeper", info.cleared);
    },
    [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks],
  );

  const onBananaCatchRunEnd = useCallback(
    (info: { cleared: boolean; coinsEarned: number }) => {
      setRunCashEarned(info.coinsEarned);
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.cleared,
      });
      void creditHeroClear(info.cleared);
      void settleFeaturedBonus("bananacatch", info.cleared);
    },
    [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks],
  );

  const onBloonHeroRunEnd = useCallback(
    (info: { cleared: boolean; didWell: boolean; coinsEarned: number }) => {
      setRunCashEarned(info.coinsEarned);
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.didWell,
      });
      void creditHeroClear(info.cleared);
      void settleFeaturedBonus("bloonhero", info.cleared);
    },
    [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks],
  );

  const afterPackDone = useCallback(() => {
    if (bonusChoices?.length) {
      setRewardPack(null);
      return;
    }
    finishRewards();
  }, [bonusChoices, finishRewards]);

  const goHome = () => navigate("/");
  const goGames = () => navigate(gamesPath());

  return (
    <>
      <SiteHeader />
      <div className="site-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/shop" element={<ShopRoute />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route
            path="/marketplace"
            element={<Marketplace onBack={goHome} />}
          />
          <Route path="/marketplace/:listingId" element={<ListingPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/paragon-lab" element={<ParagonDegreeLab />} />
          <Route path="/trade/:tradeId" element={<TradeRoom />} />
          <Route path="/user/:username" element={<UserCollectionPage />} />
          <Route
            path="/zoomed"
            element={
              <LazyGame>
                <ZoomedGame
                  onBack={goGames}
                  onRunEnd={quizRewardHandlers.zoomed}
                />
              </LazyGame>
            }
          />
          <Route
            path="/geoguessr"
            element={
              <LazyGame>
                <GeoguessrGame
                  onBack={goGames}
                  onRunEnd={quizRewardHandlers.geoguessr}
                />
              </LazyGame>
            }
          />
          <Route
            path="/pricecheck"
            element={
              <LazyGame>
                <PriceCheckGame
                  onBack={goGames}
                  onRunEnd={quizRewardHandlers.pricecheck}
                />
              </LazyGame>
            }
          />
          <Route
            path="/orderup"
            element={
              <LazyGame>
                <OrderUpGame
                  onBack={goGames}
                  onRunEnd={quizRewardHandlers.orderup}
                />
              </LazyGame>
            }
          />
          <Route
            path="/bloonle"
            element={
              <LazyGame>
                <BloonleGame
                  onBack={goGames}
                  onFastSolve={offerBloonleBonus}
                  onRunEnd={onBloonleRunEnd}
                />
              </LazyGame>
            }
          />
          <Route
            path="/camodetection"
            element={
              <LazyGame>
                <CamoDetectionGame
                  onBack={goGames}
                  onRunEnd={quizRewardHandlers.camodetection}
                />
              </LazyGame>
            }
          />
          <Route
            path="/bloonssweeper"
            element={
              <LazyGame>
                <BloonsSweeperGame onBack={goGames} onRunEnd={onSweeperRunEnd} />
              </LazyGame>
            }
          />
          <Route
            path="/bananacatch"
            element={
              <LazyGame>
                <BananaCatchGame
                  onBack={goGames}
                  onRunEnd={onBananaCatchRunEnd}
                />
              </LazyGame>
            }
          />
          <Route
            path="/bloonhero"
            element={
              <LazyGame>
                <BloonHeroGame onBack={goGames} onRunEnd={onBloonHeroRunEnd} />
              </LazyGame>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {bonusToast ? (
        <div className="featured-bonus-toast" role="status">
          {bonusToast}
        </div>
      ) : null}

      {rewardPack ? (
        <PackOpenerTest
          open
          mode="reward"
          pack={rewardPack.pack}
          onClose={() => {
            setRewardPack(null);
            if (!bonusChoices?.length) {
              finishRewards();
            }
          }}
          onFinished={() => {
            afterPackDone();
          }}
        />
      ) : null}

      {!rewardPack && bonusChoices ? (
        <BonusPackPicker
          open
          options={bonusChoices}
          onPick={(pack) => {
            setBonusChoices(null);
            setRewardPack({ pack, reason: "bonus" });
          }}
        />
      ) : null}

      {showBackToGames && !rewardPack && !bonusChoices ? (
        <div className="rewards-done" role="dialog" aria-label="Rewards claimed">
          <div className="rewards-done__card">
            <p className="eyebrow">Rewards claimed</p>
            <h2>Nice haul</h2>
            <div className="rewards-done__cash">
              <CashAmount amount={runCashEarned} size={28} />
              <span className="rewards-done__cash-label">Cash earned</span>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => {
                setShowBackToGames(false);
                navigate(gamesPath());
              }}
            >
              Back to Games
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <DesktopOnlineGate />
      <DesktopUpdateGate />
      <LivePlayerSync />
      <HeroFxProvider>
        <AppShell />
      </HeroFxProvider>
    </BrowserRouter>
  );
}
