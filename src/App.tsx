import { useCallback, useState } from "react";
import { useCardCollection } from "./auth/CardCollectionProvider";
import { ArcadeHome, type GameId } from "./components/ArcadeHome";
import { BonusPackPicker } from "./components/BonusPackPicker";
import { CardLab, type CardsOpenOpts } from "./components/CardLab";
import { Leaderboard } from "./components/Leaderboard";
import { PackOpenerTest } from "./components/PackOpenerTest";
import { SiteHeader } from "./components/SiteHeader";
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
import "./index.css";

type Screen = "arcade" | "cards" | "leaderboard" | GameId;

type RewardPackState = {
  pack: PackDef;
  reason: "clear" | "bonus";
};

const QUIZ_BONUS_STREAK = 4;
const BLOONLE_BONUS_MAX_TRIES = 3;

export default function App() {
  const { owned } = useCardCollection();
  const [screen, setScreen] = useState<Screen>("arcade");
  const [cardsOpen, setCardsOpen] = useState<CardsOpenOpts | null>(null);
  const [rewardPack, setRewardPack] = useState<RewardPackState | null>(null);
  const [bonusChoices, setBonusChoices] = useState<PackDef[] | null>(null);
  const [bonusBlurb, setBonusBlurb] = useState("");
  const [pendingHighlights, setPendingHighlights] = useState<string[]>([]);
  const [pendingTower, setPendingTower] = useState<string | undefined>();
  const [viewingPlayer, setViewingPlayer] = useState<{
    userId: string;
    username: string;
  } | null>(null);

  const openCards = (opts?: CardsOpenOpts) => {
    setCardsOpen(opts ?? null);
    setViewingPlayer(null);
    setScreen("cards");
  };

  const finishRewards = useCallback(
    (highlightIds: string[], tower?: string) => {
      setRewardPack(null);
      setBonusChoices(null);
      setBonusBlurb("");
      setPendingHighlights([]);
      setPendingTower(undefined);
      if (highlightIds.length) {
        openCards({ tower, highlightIds });
      }
    },
    [],
  );

  /** Clear run → free random pack; streak ≥4 → pick 1 of 3 after. */
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
        if (choices.length) {
          setBonusChoices(choices);
          setBonusBlurb(
            `${info.bestStreak}-streak — you earned an extra pack. Pick one!`,
          );
        } else {
          setBonusChoices(null);
          setBonusBlurb("");
        }
        return;
      }

      setRewardPack(null);
      if (choices.length) {
        setBonusChoices(choices);
        setBonusBlurb(
          `${info.bestStreak}-streak — you earned a bonus pack. Pick one!`,
        );
      } else {
        setBonusChoices(null);
        setBonusBlurb("");
      }
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
      setBonusBlurb(
        `Solved in ${guesses} ${guesses === 1 ? "try" : "tries"} — pick a bonus pack!`,
      );
    },
    [owned],
  );

  const afterPackDone = useCallback(
    (pulls: { id: string }[], pack: PackDef) => {
      const highlights = [...pendingHighlights, ...pulls.map((c) => c.id)];
      const tower =
        pack.kind === "tower" ? (pack.tower ?? undefined) : pendingTower;

      // Free clear pack finished; bonus picker still waiting.
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

  const goArcade = () => {
    setCardsOpen(null);
    setViewingPlayer(null);
    setScreen("arcade");
  };

  return (
    <>
      <SiteHeader onHome={goArcade} />
      <div className="site-main">
        {screen === "zoomed" ? (
          <ZoomedGame onBack={goArcade} onRunEnd={offerQuizRewards} />
        ) : screen === "geoguessr" ? (
          <GeoguessrGame onBack={goArcade} onRunEnd={offerQuizRewards} />
        ) : screen === "pricecheck" ? (
          <PriceCheckGame onBack={goArcade} onRunEnd={offerQuizRewards} />
        ) : screen === "orderup" ? (
          <OrderUpGame onBack={goArcade} onRunEnd={offerQuizRewards} />
        ) : screen === "bloonle" ? (
          <BloonleGame onBack={goArcade} onFastSolve={offerBloonleBonus} />
        ) : screen === "leaderboard" ? (
          <Leaderboard
            onBack={goArcade}
            onOpenCollection={(player) => {
              setCardsOpen(null);
              setViewingPlayer(player);
              setScreen("cards");
            }}
          />
        ) : screen === "cards" ? (
          <CardLab
            initial={cardsOpen}
            viewer={viewingPlayer}
            onBack={() => {
              if (viewingPlayer) {
                setViewingPlayer(null);
                setScreen("leaderboard");
                return;
              }
              goArcade();
            }}
          />
        ) : (
          <ArcadeHome
            onPlay={(game) => setScreen(game)}
            onOpenCards={() => openCards()}
            onOpenLeaderboard={() => setScreen("leaderboard")}
            onPackFinished={({ pack, pulls }) => {
              openCards({
                tower:
                  pack.kind === "tower" ? (pack.tower ?? undefined) : undefined,
                highlightIds: pulls.map((c) => c.id),
              });
            }}
          />
        )}
      </div>

      {rewardPack ? (
        <PackOpenerTest
          open
          mode="reward"
          pack={rewardPack.pack}
          onClose={() => {
            // X out of opener — still offer bonus pick if queued.
            setRewardPack(null);
            if (!bonusChoices?.length) {
              if (pendingHighlights.length) {
                finishRewards(pendingHighlights, pendingTower);
              }
            }
          }}
          onFinished={({ pack, pulls }) => {
            afterPackDone(pulls, pack);
          }}
        />
      ) : null}

      {!rewardPack && bonusChoices ? (
        <BonusPackPicker
          open
          options={bonusChoices}
          blurb={bonusBlurb}
          onPick={(pack) => {
            setBonusChoices(null);
            setRewardPack({ pack, reason: "bonus" });
          }}
          onSkip={() => {
            finishRewards(pendingHighlights, pendingTower);
          }}
        />
      ) : null}
    </>
  );
}
