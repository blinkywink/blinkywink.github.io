import { useEffect, useMemo, useState } from "react";
import {
  allCategoryPacks,
  dayStamp,
  featuredShopPacks,
  formatShopCountdown,
  msUntilShopRotation,
  packPrice,
  sfxTestPack,
  type PackDef,
} from "../lib/packTheme";
import type { MonkeyCardSpec } from "../lib/pathCombos";
import { BoosterPack } from "./BoosterPack";
import { DailyClaimButton } from "./DailyClaimButton";
import { PackOpenerTest } from "./PackOpenerTest";
import { ShopDirectShelf } from "./ShopDirectShelf";
import { ShopHeroesShelf } from "./ShopHeroesShelf";
import { playCardFocus, preloadPackSounds } from "../lib/packSounds";

type Props = {
  onPackFinished?: (result: {
    pack: PackDef;
    pulls: MonkeyCardSpec[];
    unlocked: MonkeyCardSpec[];
    duplicateCash: number;
  }) => void;
};

function useShopClock() {
  const [remaining, setRemaining] = useState(() => msUntilShopRotation());
  const [shopDay, setShopDay] = useState(() => dayStamp());

  useEffect(() => {
    const tick = () => {
      setRemaining(msUntilShopRotation());
      setShopDay((prev) => {
        const next = dayStamp();
        return prev === next ? prev : next;
      });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { remaining, shopDay };
}

export function ShopPage({ onPackFinished }: Props) {
  const [activePack, setActivePack] = useState<PackDef | null>(null);
  const { remaining, shopDay } = useShopClock();
  const featured = useMemo(() => featuredShopPacks(shopDay), [shopDay]);
  const categories = useMemo(() => allCategoryPacks(), []);
  const sfxTest = useMemo(() => sfxTestPack(), []);

  useEffect(() => {
    preloadPackSounds();
  }, []);

  const renderPackButton = (pack: PackDef) => {
    const price = packPrice(pack);
    const free = price <= 0;
    return (
      <button
        key={pack.id}
        type="button"
        className="pack-shelf__item"
        onClick={() => {
          preloadPackSounds();
          playCardFocus();
          setActivePack(pack);
        }}
      >
        <BoosterPack
          pack={pack}
          effects={false}
          className="pack-shelf__booster"
        />
        <span className="pack-shelf__label">
          <strong>{pack.title}</strong>
          <span className="pack-shelf__price">
            {free ? (
              "Free"
            ) : (
              <>
                <img
                  src="/images/ui/money-icon.webp"
                  alt=""
                  width={22}
                  height={22}
                />
                {price.toLocaleString()}
              </>
            )}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="shop-page">
      <section className="pack-shelf" aria-label="Shop">
        <div className="pack-shelf__head">
          <h3 className="section-label">Featured</h3>
          <p className="shop-timer">
            Refresh in <strong>{formatShopCountdown(remaining)}</strong>
          </p>
        </div>
        <div className="pack-shelf__row">{featured.map(renderPackButton)}</div>

        <div className="pack-shelf__head pack-shelf__head--sub">
          <h3 className="section-label">SFX test</h3>
        </div>
        <div className="pack-shelf__row">{renderPackButton(sfxTest)}</div>

        <div className="pack-shelf__head pack-shelf__head--sub">
          <h3 className="section-label">Categories</h3>
        </div>
        <div className="pack-shelf__row">
          {categories.map(renderPackButton)}
        </div>

        <ShopDirectShelf />
        <ShopHeroesShelf />
      </section>

      <section className="arcade__utility" aria-label="Daily rewards">
        <DailyClaimButton />
      </section>

      <PackOpenerTest
        open={activePack != null}
        pack={activePack ?? undefined}
        onClose={() => setActivePack(null)}
        onFinished={onPackFinished}
      />
    </div>
  );
}
