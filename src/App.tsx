import { useCallback, useEffect, useMemo, useState, lazy, Suspense, type ReactNode } from "react";
import {
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
import { ArcadeHome, type GameId } from "./components/ArcadeHome";
import { BonusPackPicker } from "./components/BonusPackPicker";
import { CardLab, type CardsOpenOpts } from "./components/CardLab";
import { LoadingDots } from "./components/LoadingDots";
import { EndlessHaulCard } from "./components/EndlessHaulCard";
import {
  RewardsHaulCard,
  type RunHaulSummary,
} from "./components/RewardsHaulCard";
import { AboutPage } from "./components/AboutPage";
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
import { T5GridExport } from "./components/T5GridExport";
import { HubPeekExport } from "./components/HubPeekExport";
import { RouteFallback } from "./components/RouteFallback";
import { DesktopOnlineGate } from "./components/DesktopOnlineGate";
import { DesktopUpdateGate } from "./components/DesktopUpdateGate";
import { LivePlayerSync } from "./components/LivePlayerSync";
import { NavigationRefresh } from "./components/NavigationRefresh";
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
import {
  submitEndlessGameScore,
  type EndlessGameId,
  type GameScoreReport,
} from "./lib/gameScores";
import { fetchPublicPlayerPage, peekPublicPlayerPage } from "./lib/playerPage";
import { recordHeroClear } from "./lib/profileHeroes";
import { heroById } from "./data/heroes";
import {
  collectionPath,
  gamePath,
  gamesPath,
  userCollectionPath,
  type GamePath,
} from "./lib/routes";
import { SWEEPER_DIFFICULTIES } from "./games/bloonssweeper/config";

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
const RoundCheckGame = lazy(() =>
  import("./games/roundcheck").then((m) => ({ default: m.RoundCheckGame })),
);
const RicoShotGame = lazy(() =>
  import("./games/ricoshot").then((m) => ({ default: m.RicoShotGame })),
);
const CamoDetectionGame = lazy(() =>
  import("./games/camodetection").then((m) => ({ default: m.CamoDetectionGame })),
);
const BloonsSweeperGame = lazy(() =>
  import("./games/bloonssweeper").then((m) => ({ default: m.BloonsSweeperGame })),
);
const BlowFreeGame = lazy(() =>
  import("./games/blowfree").then((m) => ({ default: m.BlowFreeGame })),
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
  const location = useLocation();
  const initial = (location.state as CollectionLocationState) ?? null;

  return <CardLab initial={initial} />;
}

function UserCollectionPage() {
  const { username = "" } = useParams();
  const [page, setPage] = useState<Awaited<
    ReturnType<typeof fetchPublicPlayerPage>
  >>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    const cached = peekPublicPlayerPage(username);
    if (cached !== undefined) {
      if (cached) setPage(cached);
      else setError("Player not found.");
      setLoading(false);
    } else {
      setLoading(true);
      setPage(null);
    }

    void fetchPublicPlayerPage(username, {
      revalidate: true,
      onRevalidate: (next) => {
        if (cancelled) return;
        if (!next) {
          setError("Player not found.");
          setPage(null);
          return;
        }
        setError(null);
        setPage(next);
      },
    })
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setError("Player not found.");
          setPage(null);
        } else {
          setError(null);
          setPage(next);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load player.");
        if (cached === undefined) setPage(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return (
      <div className="card-lab">
        <LoadingDots label="Loading player" className="card-lab__loading" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="card-lab">
        <header className="card-lab__header">
          <div className="card-lab__titles">
            <p className="eyebrow">Collection</p>
            <h1>{username || "Player"}</h1>
            <p className="card-lab__blurb">{error ?? "Player not found."}</p>
          </div>
        </header>
      </div>
    );
  }

  const { profile } = page;
  return (
    <CardLab
      viewer={{
        userId: profile.userId,
        username: profile.username,
        avatar: profile.avatar,
        showcaseCardIds: profile.showcaseCardIds,
        accentColor: profile.accentColor,
        ownedHeroIds: profile.ownedHeroIds,
        equippedHeroId: profile.equippedHeroId,
        heroLevels: profile.heroLevels,
        badgeIds: profile.badgeIds,
      }}
      viewerCollection={{
        ownedIds: page.ownedIds,
        seeds: page.seeds,
        paragons: page.paragons,
        rank: page.rank,
      }}
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
  const location = useLocation();
  const [rewardPack, setRewardPack] = useState<RewardPackState | null>(null);
  const [bonusChoices, setBonusChoices] = useState<PackDef[] | null>(null);
  const [bonusToast, setBonusToast] = useState<string | null>(null);
  const [showBackToGames, setShowBackToGames] = useState(false);
  const [runHaul, setRunHaul] = useState<RunHaulSummary | null>(null);
  const [gameReplayKey, setGameReplayKey] = useState(0);
  const [endlessHaul, setEndlessHaul] = useState<{
    gameId: EndlessGameId;
    report: GameScoreReport | null;
    loading: boolean;
  } | null>(null);

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
        // HeroFxProvider toasts once when profile shows a ready level-up.
        return;
      }
      if (result.required > 0) {
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

  const beginEndlessHaul = useCallback(
    (gameId: EndlessGameId, score: number) => {
      setEndlessHaul({ gameId, report: null, loading: true });
      void submitEndlessGameScore(gameId, score).then((report) => {
        setEndlessHaul({ gameId, report, loading: false });
      });
    },
    [],
  );

  const queueClearAndBonusPacks = useCallback(
    (opts: {
      cleared: boolean;
      wantBonus: boolean;
      /** Endless games always open Nice Haul even with no packs. */
      alwaysHaul?: boolean;
      /** Open Nice Haul after this run even on a miss (non-quiz games). */
      haulAfter?: boolean;
    }) => {
      const free = opts.cleared ? pickRewardTowerPack(owned) : null;
      const exclude = new Set(free?.tower ? [free.tower] : []);
      const choices = opts.wantBonus
        ? pickRewardTowerPackChoices(owned, 3, exclude)
        : [];

      setShowBackToGames(false);

      // Stay on the game route. Pack / picker overlays cover the results UI.
      if (free) {
        setRewardPack({ pack: free, reason: "clear" });
        setBonusChoices(choices.length ? choices : null);
      } else if (choices.length) {
        setRewardPack(null);
        setBonusChoices(choices);
      } else {
        setRewardPack(null);
        setBonusChoices(null);
        // Quiz fails keep their Continue screen — don't stack Nice Haul on top.
        if (opts.alwaysHaul || opts.cleared || opts.haulAfter) {
          setShowBackToGames(true);
        }
      }
    },
    [owned],
  );

  const quizRewardHandlers = useMemo(() => {
    const make =
      (game: Exclude<FeaturedBonusGame, "camodetection" | "bananacatch">) =>
      (info: {
        cleared: boolean;
        correctCount: number;
        coinsEarned: number;
      }) => {
        setEndlessHaul(null);
        setRunHaul({
          game,
          cleared: info.cleared,
          cashEarned: info.coinsEarned,
          details: [`${info.correctCount} correct`],
        });
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
    };
  }, [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks]);

  const onCamoDetectionRunEnd = useCallback(
    (info: {
      cleared: boolean;
      correctCount: number;
      coinsEarned: number;
      score: number;
    }) => {
      setRunHaul({
        game: "camodetection",
        cleared: info.cleared,
        cashEarned: info.coinsEarned,
        details: [
          `${info.correctCount} correct`,
          `${info.score.toLocaleString("en-US")} answered`,
        ],
      });
      beginEndlessHaul("camodetection", info.score);
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.cleared,
        alwaysHaul: true,
      });
      void creditHeroClear(info.cleared);
      void settleFeaturedBonus("camodetection", info.cleared);
    },
    [
      settleFeaturedBonus,
      creditHeroClear,
      queueClearAndBonusPacks,
      beginEndlessHaul,
    ],
  );

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
    (info: {
      cleared: boolean;
      coinsEarned: number;
      guesses: number;
      answer: string;
    }) => {
      setEndlessHaul(null);
      setRunHaul({
        game: "bloonle",
        cleared: info.cleared,
        cashEarned: info.coinsEarned,
        details: [
          info.cleared
            ? `Solved in ${info.guesses} guess${info.guesses === 1 ? "" : "es"}`
            : "Out of guesses",
          `Answer: ${info.answer}`,
        ],
      });
      // Bloonle has no clear pack; still show haul so results aren't hidden.
      setShowBackToGames(true);
      void (async () => {
        await creditHeroClear(info.cleared);
        void settleFeaturedBonus("bloonle", info.cleared);
      })();
    },
    [settleFeaturedBonus, creditHeroClear],
  );

  const onRoundCheckRunEnd = useCallback(
    (info: {
      cleared: boolean;
      coinsEarned: number;
      solves: number;
      perfect: boolean;
    }) => {
      setEndlessHaul(null);
      setRunHaul({
        game: "roundcheck",
        cleared: info.cleared,
        cashEarned: info.coinsEarned,
        details: [
          info.perfect
            ? "Perfect · 4 first-try solves"
            : `${info.solves}/4 solves`,
          info.cleared ? "Run cleared" : "Out of lives",
        ],
      });
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.cleared,
        haulAfter: true,
      });
      void creditHeroClear(info.cleared);
      void settleFeaturedBonus("roundcheck", info.cleared);
    },
    [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks],
  );

  const onRicoShotRunEnd = useCallback(
    (info: {
      cleared: boolean;
      coinsEarned: number;
      solves: number;
      perfect: boolean;
    }) => {
      setEndlessHaul(null);
      setRunHaul({
        game: "heliumpop",
        cleared: info.cleared,
        cashEarned: info.coinsEarned,
        details: [
          info.perfect
            ? "Perfect · 5 clean pops"
            : `${info.solves}/5 pops`,
          info.cleared ? "Run cleared" : "Out of lives",
        ],
      });
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.cleared,
        haulAfter: true,
      });
      void creditHeroClear(info.cleared);
      void settleFeaturedBonus("heliumpop", info.cleared);
    },
    [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks],
  );

  const onSweeperRunEnd = useCallback(
    (info: {
      cleared: boolean;
      coinsEarned: number;
      difficulty: keyof typeof SWEEPER_DIFFICULTIES;
    }) => {
      if (!info.cleared) return;
      setEndlessHaul(null);
      const diffLabel = SWEEPER_DIFFICULTIES[info.difficulty].label;
      setRunHaul({
        game: "bloonssweeper",
        cleared: true,
        cashEarned: info.coinsEarned,
        details: [`${diffLabel} board`, "Board cleared"],
      });
      queueClearAndBonusPacks({
        cleared: true,
        wantBonus: true,
        haulAfter: true,
      });
      void creditHeroClear(true);
      void settleFeaturedBonus("bloonssweeper", true);
    },
    [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks],
  );

  const onBlowFreeRunEnd = useCallback(
    (info: {
      cleared: boolean;
      coinsEarned: number;
      mode: "daily" | "practice";
    }) => {
      setEndlessHaul(null);
      setRunHaul({
        game: "blowfree",
        cleared: info.cleared,
        cashEarned: info.coinsEarned,
        details: [
          info.mode === "daily" ? "Daily board" : "Practice board",
          info.cleared ? "Grid filled" : "Run ended",
        ],
      });
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.cleared && info.mode === "daily",
        haulAfter: true,
      });
      void creditHeroClear(info.cleared);
      void settleFeaturedBonus("blowfree", info.cleared);
    },
    [settleFeaturedBonus, creditHeroClear, queueClearAndBonusPacks],
  );

  const onBananaCatchRunEnd = useCallback(
    (info: { cleared: boolean; coinsEarned: number; score: number }) => {
      setRunHaul({
        game: "bananacatch",
        cleared: info.cleared,
        cashEarned: info.coinsEarned,
        details: [`${info.score.toLocaleString("en-US")} bananas`],
      });
      beginEndlessHaul("bananacatch", info.score);
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.cleared,
        alwaysHaul: true,
      });
      void creditHeroClear(info.cleared);
      void settleFeaturedBonus("bananacatch", info.cleared);
    },
    [
      settleFeaturedBonus,
      creditHeroClear,
      queueClearAndBonusPacks,
      beginEndlessHaul,
    ],
  );

  const onBloonHeroRunEnd = useCallback(
    (info: { cleared: boolean; didWell: boolean; coinsEarned: number }) => {
      setEndlessHaul(null);
      setRunHaul({
        game: "bloonhero",
        cleared: info.cleared,
        cashEarned: info.coinsEarned,
        details: [info.didWell ? "Strong accuracy" : "Tough chart"],
      });
      queueClearAndBonusPacks({
        cleared: info.cleared,
        wantBonus: info.didWell,
        haulAfter: true,
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

  const rewardsOverlayOpen =
    Boolean(rewardPack) || Boolean(bonusChoices) || showBackToGames;

  useEffect(() => {
    document.body.classList.toggle("rewards-overlay-open", rewardsOverlayOpen);
    return () => {
      document.body.classList.remove("rewards-overlay-open");
    };
  }, [rewardsOverlayOpen]);

  const dismissHaul = useCallback(() => {
    setShowBackToGames(false);
    setEndlessHaul(null);
    setRunHaul(null);
  }, []);

  const playAgain = useCallback(() => {
    const game = runHaul?.game ?? endlessHaul?.gameId ?? null;
    dismissHaul();
    setGameReplayKey((k) => k + 1);
    if (game) navigate(gamePath(game as GamePath), { replace: true });
  }, [runHaul?.game, endlessHaul?.gameId, dismissHaul, navigate]);

  const backToGames = useCallback(() => {
    dismissHaul();
    navigate(gamesPath());
  }, [dismissHaul, navigate]);

  if (location.pathname === "/__t5-grid-export") {
    return <T5GridExport />;
  }
  if (location.pathname === "/__hub-peek-export") {
    return <HubPeekExport />;
  }

  return (
    <>
      <SiteHeader />
      <div className="site-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
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
                  key={gameReplayKey}
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
                  key={gameReplayKey}
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
                  key={gameReplayKey}
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
                  key={gameReplayKey}
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
                  key={gameReplayKey}
                  onBack={goGames}
                  onFastSolve={offerBloonleBonus}
                  onRunEnd={onBloonleRunEnd}
                />
              </LazyGame>
            }
          />
          <Route
            path="/roundcheck"
            element={
              <LazyGame>
                <RoundCheckGame
                  key={gameReplayKey}
                  onBack={goGames}
                  onRunEnd={onRoundCheckRunEnd}
                />
              </LazyGame>
            }
          />
          <Route
            path="/heliumpop"
            element={
              <LazyGame>
                <RicoShotGame
                  key={gameReplayKey}
                  onBack={goGames}
                  onRunEnd={onRicoShotRunEnd}
                />
              </LazyGame>
            }
          />
          <Route path="/ricoshot" element={<Navigate to="/heliumpop" replace />} />
          <Route
            path="/camodetection"
            element={
              <LazyGame>
                <CamoDetectionGame
                  key={gameReplayKey}
                  onBack={goGames}
                  onRunEnd={onCamoDetectionRunEnd}
                />
              </LazyGame>
            }
          />
          <Route
            path="/bloonssweeper"
            element={
              <LazyGame>
                <BloonsSweeperGame
                  key={gameReplayKey}
                  onBack={goGames}
                  onRunEnd={onSweeperRunEnd}
                />
              </LazyGame>
            }
          />
          <Route
            path="/blowfree"
            element={
              <LazyGame>
                <BlowFreeGame
                  key={gameReplayKey}
                  onBack={goGames}
                  onRunEnd={onBlowFreeRunEnd}
                />
              </LazyGame>
            }
          />
          <Route
            path="/bananacatch"
            element={
              <LazyGame>
                <BananaCatchGame
                  key={gameReplayKey}
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
                <BloonHeroGame
                  key={gameReplayKey}
                  onBack={goGames}
                  onRunEnd={onBloonHeroRunEnd}
                />
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
        endlessHaul ? (
          <EndlessHaulCard
            gameId={endlessHaul.gameId}
            cashEarned={runHaul?.cashEarned ?? 0}
            report={endlessHaul.report}
            loading={endlessHaul.loading}
            onPlayAgain={playAgain}
            onBack={backToGames}
          />
        ) : runHaul ? (
          <RewardsHaulCard
            summary={runHaul}
            onPlayAgain={playAgain}
            onBackToGames={backToGames}
          />
        ) : null
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
    <>
      <ScrollToTop />
      <DesktopOnlineGate />
      <DesktopUpdateGate />
      <LivePlayerSync />
      <NavigationRefresh>
        <AppShell />
      </NavigationRefresh>
    </>
  );
}
