import { useCallback, useEffect, useState } from "react";
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
import { ArcadeHome, type GameId } from "./components/ArcadeHome";
import { BonusPackPicker } from "./components/BonusPackPicker";
import { CardLab, type CardsOpenOpts } from "./components/CardLab";
import { Leaderboard } from "./components/Leaderboard";
import { ListingPage } from "./components/ListingPage";
import { Marketplace } from "./components/Marketplace";
import { PackOpenerTest } from "./components/PackOpenerTest";
import { ProfilePage } from "./components/ProfilePage";
import { ShopPage } from "./components/ShopPage";
import { SiteHeader } from "./components/SiteHeader";
import { TradeRoom } from "./components/TradeRoom";
import { BloonleGame } from "./games/bloonle";
import { GeoguessrGame } from "./games/geoguessr";
import { OrderUpGame } from "./games/orderup";
import { PriceCheckGame } from "./games/pricecheck";
import { ZoomedGame } from "./games/zoomed";
import {
  pickRewardTowerPack,
  pickRewardTowerPackChoices,
  type PackDef,
} from "./lib/packTheme";
import { fetchProfileByUsername } from "./lib/profiles";
import {
  collectionPath,
  gamePath,
  leaderboardPath,
  userCollectionPath,
  type GamePath,
} from "./lib/routes";
import type { AvatarCrop } from "./lib/avatar";
import "./index.css";

type RewardPackState = {
  pack: PackDef;
  reason: "clear" | "bonus";
};

type CollectionLocationState = CardsOpenOpts | null;

const QUIZ_BONUS_STREAK = 4;
const BLOONLE_BONUS_MAX_TRIES = 3;

function HomePage() {
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
  const navigate = useNavigate();
  const [rewardPack, setRewardPack] = useState<RewardPackState | null>(null);
  const [bonusChoices, setBonusChoices] = useState<PackDef[] | null>(null);
  const [pendingHighlights, setPendingHighlights] = useState<string[]>([]);
  const [pendingTower, setPendingTower] = useState<string | undefined>();

  const finishRewards = useCallback(
    (highlightIds: string[], tower?: string) => {
      setRewardPack(null);
      setBonusChoices(null);
      setPendingHighlights([]);
      setPendingTower(undefined);
      navigate(collectionPath(), {
        state:
          highlightIds.length > 0
            ? ({ tower, highlightIds } satisfies CardsOpenOpts)
            : null,
      });
    },
    [navigate],
  );

  const offerQuizRewards = useCallback(
    (info: { cleared: boolean; bestStreak: number }) => {
      const wantBonus = info.bestStreak >= QUIZ_BONUS_STREAK;
      const free = info.cleared ? pickRewardTowerPack(owned) : null;
      const exclude = new Set(free?.tower ? [free.tower] : []);
      const choices = wantBonus
        ? pickRewardTowerPackChoices(owned, 3, exclude)
        : [];

      setPendingHighlights([]);
      setPendingTower(undefined);

      if (free) {
        setRewardPack({ pack: free, reason: "clear" });
        setBonusChoices(choices.length ? choices : null);
        return;
      }

      setRewardPack(null);
      setBonusChoices(choices.length ? choices : null);
    },
    [owned],
  );

  const offerBloonleBonus = useCallback(
    (guesses: number) => {
      if (guesses > BLOONLE_BONUS_MAX_TRIES) return;
      const choices = pickRewardTowerPackChoices(owned, 3);
      if (!choices.length) return;
      setPendingHighlights([]);
      setPendingTower(undefined);
      setRewardPack(null);
      setBonusChoices(choices);
    },
    [owned],
  );

  const afterPackDone = useCallback(
    (pulls: { id: string }[], pack: PackDef) => {
      const highlights = [...pendingHighlights, ...pulls.map((c) => c.id)];
      const tower =
        pack.kind === "tower" ? (pack.tower ?? undefined) : pendingTower;

      if (bonusChoices?.length) {
        setRewardPack(null);
        setPendingHighlights(highlights);
        setPendingTower(tower);
        return;
      }

      finishRewards(highlights, tower);
    },
    [bonusChoices, finishRewards, pendingHighlights, pendingTower],
  );

  const goHome = () => navigate("/");

  return (
    <>
      <SiteHeader />
      <div className="site-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<ShopRoute />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route
            path="/marketplace"
            element={<Marketplace onBack={goHome} />}
          />
          <Route path="/marketplace/:listingId" element={<ListingPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/trade/:tradeId" element={<TradeRoom />} />
          <Route path="/user/:username" element={<UserCollectionPage />} />
          <Route
            path="/zoomed"
            element={
              <ZoomedGame onBack={goHome} onRunEnd={offerQuizRewards} />
            }
          />
          <Route
            path="/geoguessr"
            element={
              <GeoguessrGame onBack={goHome} onRunEnd={offerQuizRewards} />
            }
          />
          <Route
            path="/pricecheck"
            element={
              <PriceCheckGame onBack={goHome} onRunEnd={offerQuizRewards} />
            }
          />
          <Route
            path="/orderup"
            element={
              <OrderUpGame onBack={goHome} onRunEnd={offerQuizRewards} />
            }
          />
          <Route
            path="/bloonle"
            element={
              <BloonleGame onBack={goHome} onFastSolve={offerBloonleBonus} />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {rewardPack ? (
        <PackOpenerTest
          open
          mode="reward"
          pack={rewardPack.pack}
          onClose={() => {
            setRewardPack(null);
            if (!bonusChoices?.length) {
              if (pendingHighlights.length) {
                finishRewards(pendingHighlights, pendingTower);
              }
            }
          }}
          onFinished={({ pack, unlocked }) => {
            afterPackDone(unlocked, pack);
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
      <AppShell />
    </BrowserRouter>
  );
}
