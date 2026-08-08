import { useState } from "react";
import { ArcadeHome, type GameId } from "./components/ArcadeHome";
import { CardLab, type CardsOpenOpts } from "./components/CardLab";
import { Leaderboard } from "./components/Leaderboard";
import { SiteHeader } from "./components/SiteHeader";
import { BloonleGame } from "./games/bloonle";
import { GeoguessrGame } from "./games/geoguessr";
import { OrderUpGame } from "./games/orderup";
import { PriceCheckGame } from "./games/pricecheck";
import { ZoomedGame } from "./games/zoomed";
import "./index.css";

type Screen = "arcade" | "cards" | "leaderboard" | GameId;

export default function App() {
  const [screen, setScreen] = useState<Screen>("arcade");
  const [cardsOpen, setCardsOpen] = useState<CardsOpenOpts | null>(null);

  const openCards = (opts?: CardsOpenOpts) => {
    setCardsOpen(opts ?? null);
    setScreen("cards");
  };

  return (
    <>
      <SiteHeader
        onHome={() => {
          setCardsOpen(null);
          setScreen("arcade");
        }}
      />
      <div className="site-main">
        {screen === "zoomed" ? (
          <ZoomedGame onBack={() => setScreen("arcade")} />
        ) : screen === "geoguessr" ? (
          <GeoguessrGame onBack={() => setScreen("arcade")} />
        ) : screen === "pricecheck" ? (
          <PriceCheckGame onBack={() => setScreen("arcade")} />
        ) : screen === "orderup" ? (
          <OrderUpGame onBack={() => setScreen("arcade")} />
        ) : screen === "bloonle" ? (
          <BloonleGame onBack={() => setScreen("arcade")} />
        ) : screen === "leaderboard" ? (
          <Leaderboard onBack={() => setScreen("arcade")} />
        ) : screen === "cards" ? (
          <CardLab
            initial={cardsOpen}
            onBack={() => {
              setCardsOpen(null);
              setScreen("arcade");
            }}
          />
        ) : (
          <ArcadeHome
            onPlay={(game) => setScreen(game)}
            onOpenCards={() => openCards()}
            onOpenLeaderboard={() => setScreen("leaderboard")}
            onPackFinished={({ pack, pulls }) => {
              openCards({
                tower: pack.kind === "tower" ? pack.tower : undefined,
                highlightIds: pulls.map((c) => c.id),
              });
            }}
          />
        )}
      </div>
    </>
  );
}
