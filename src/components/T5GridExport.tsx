import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { pickT5GridCards } from "../lib/t5GridPicker";
import { MonkeyCard } from "./MonkeyCard";

/** Real MonkeyCard previews - same rendering as the PFP card picker. */
export function T5GridExport({ seed: seedProp }: { seed?: number }) {
  const [params] = useSearchParams();
  const seed = useMemo(() => {
    if (seedProp != null) return seedProp;
    const raw = params.get("seed");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : 42;
  }, [params, seedProp]);
  const cards = useMemo(() => pickT5GridCards(seed), [seed]);

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.background = "#08080e";
    document.documentElement.dataset.exportReady = "0";
    let cancelled = false;

    const markReady = () => {
      if (cancelled) return;
      document.documentElement.dataset.exportReady = "1";
    };

    const imgs = Array.from(document.images);
    if (!imgs.length) {
      markReady();
      return () => {
        cancelled = true;
        delete document.documentElement.dataset.exportReady;
        document.body.style.margin = "";
        document.body.style.background = "";
      };
    }

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
      window.setTimeout(markReady, 500);
    });

    return () => {
      cancelled = true;
      delete document.documentElement.dataset.exportReady;
      document.body.style.margin = "";
      document.body.style.background = "";
    };
  }, [cards]);

  return (
    <div className="t5-grid-export">
      <div className="t5-grid-export__grid">
        {cards.map((card) => (
          <div key={card.id} className="t5-grid-export__cell">
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
    </div>
  );
}
