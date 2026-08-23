import { useEffect, useMemo } from "react";
import { cardSpecById } from "../lib/cardCatalog";
import {
  HUB_PEEK_CARD_IDS,
  hubPeekPacks,
} from "../lib/hubPeeks";
import { BoosterPack } from "./BoosterPack";
import { MonkeyCard } from "./MonkeyCard";

/**
 * Headless page for `npm run export-hub-peeks`.
 * Renders real MonkeyCard / BoosterPack faces for Playwright JPEG capture.
 */
export function HubPeekExport() {
  const cards = useMemo(
    () =>
      HUB_PEEK_CARD_IDS.map((id) => cardSpecById(id)).filter(
        (c): c is NonNullable<typeof c> => c != null,
      ),
    [],
  );
  const packs = useMemo(() => hubPeekPacks(), []);

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.background = "#08080e";
    document.documentElement.dataset.exportReady = "0";
    let cancelled = false;

    const markReady = () => {
      if (cancelled) return;
      document.documentElement.dataset.exportReady = "1";
    };

    const wait = window.setTimeout(() => {
      const imgs = Array.from(document.images);
      void Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      ).then(() => {
        window.setTimeout(markReady, 700);
      });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(wait);
      delete document.documentElement.dataset.exportReady;
      document.body.style.margin = "";
      document.body.style.background = "";
    };
  }, [cards, packs]);

  return (
    <div className="hub-peek-export">
      <div className="hub-peek-export__row">
        {cards.map((card) => (
          <div
            key={card.id}
            className="hub-peek-export__card"
            data-export={`card-${card.id}`}
          >
            <MonkeyCard
              entity={card.entity}
              pathLevels={card.pathLevels}
              mode="preview"
              owned
              staticArt
            />
          </div>
        ))}
      </div>
      <div className="hub-peek-export__row">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className="hub-peek-export__pack"
            data-export={`pack-${pack.id}`}
          >
            <BoosterPack
              pack={pack}
              effects={false}
              className="hub-peek-export__booster"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
