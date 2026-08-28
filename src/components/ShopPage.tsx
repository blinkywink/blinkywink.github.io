import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  allCategoryPacks,
  dayStamp,
  featuredShopPacks,
  formatShopCountdown,
  msUntilShopRotation,
  packPrice,
  type PackDef,
  type TowerCategory,
} from "../lib/packTheme";
import {
  getFreeCategoryCounts,
  refreshFreeCategoryPacks,
  subscribeFreeCategoryPacks,
  type FreeCategoryCounts,
} from "../lib/freeCategoryPacks";
import { subscribeRouteEnter } from "../lib/navigationRefresh";
import {
  getRemoteFeaturedTowers,
  subscribeRemoteFeatured,
} from "../lib/remoteShop";
import type { MonkeyCardSpec } from "../lib/pathCombos";
import { BoosterPack } from "./BoosterPack";
import { DailyClaimButton } from "./DailyClaimButton";
import { PackOpenerTest } from "./PackOpenerTest";
import { ShopDirectShelf } from "./ShopDirectShelf";
import { ShopHeroesShelf } from "./ShopHeroesShelf";
import { ShopToMarketLink } from "./ShopMarketSwap";
import { playCardFocus, preloadPackSounds } from "../lib/packSounds";

type Props = {
  onPackFinished?: (result: {
    pack: PackDef;
    pulls: MonkeyCardSpec[];
    unlocked: MonkeyCardSpec[];
    duplicateCash: number;
  }) => void;
};

function ShopRotationTimer({
  onDayChange,
}: {
  onDayChange: (day: string) => void;
}) {
  const [remaining, setRemaining] = useState(() => msUntilShopRotation());

  useEffect(() => {
    const tick = () => {
      setRemaining(msUntilShopRotation());
      onDayChange(dayStamp());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [onDayChange]);

  return (
    <p className="shop-timer">
      Refresh in <strong>{formatShopCountdown(remaining)}</strong>
    </p>
  );
}

function useFreeCategoryCounts(userId: string | null | undefined) {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState<FreeCategoryCounts>(() =>
    getFreeCategoryCounts(userId),
  );

  useEffect(() => {
    let cancelled = false;
    const pull = () => {
      setCounts(getFreeCategoryCounts(userId));
      void refreshFreeCategoryPacks(userId ?? null).then((next) => {
        if (!cancelled) setCounts(next);
      });
    };
    pull();
    const unsubPacks = subscribeFreeCategoryPacks(() => {
      setCounts(getFreeCategoryCounts(userId));
    });
    const unsubRoute = subscribeRouteEnter((path) => {
      if (path === "/shop" || path.startsWith("/shop/")) pull();
    });
    return () => {
      cancelled = true;
      unsubPacks();
      unsubRoute();
    };
  }, [userId, pathname]);

  return counts;
}

export function ShopPage({ onPackFinished }: Props) {
  const { session } = useAuth();
  const [activePack, setActivePack] = useState<PackDef | null>(null);
  const [shopDay, setShopDay] = useState(() => dayStamp());
  const onShopDayChange = useCallback((day: string) => {
    setShopDay((prev) => (prev === day ? prev : day));
  }, []);
  const freeCounts = useFreeCategoryCounts(session?.userId);
  const [remoteTowers, setRemoteTowers] = useState(getRemoteFeaturedTowers);
  useEffect(() => subscribeRemoteFeatured(() => {
    setRemoteTowers(getRemoteFeaturedTowers());
  }), []);
  const featured = useMemo(
    () => featuredShopPacks(shopDay, 0, remoteTowers ?? undefined),
    [shopDay, remoteTowers],
  );
  const categories = useMemo(() => allCategoryPacks(), []);

  useEffect(() => {
    preloadPackSounds();
  }, []);

  const renderPackButton = (pack: PackDef) => {
    const price = packPrice(pack);
    const free = price <= 0;
    const freeCredit =
      pack.kind === "category" && pack.category
        ? freeCounts[pack.category as TowerCategory] ?? 0
        : 0;
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
          <span
            className={`pack-shelf__price${freeCredit > 0 ? " is-free" : ""}`}
          >
            {free ? (
              "Free"
            ) : freeCredit > 0 ? (
              <>
                <img
                  src="/images/ui/money-icon.webp"
                  alt=""
                  width={22}
                  height={22}
                />
                Free ×{freeCredit}
              </>
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
      <div className="shop-page__market-link">
        <ShopToMarketLink />
      </div>
      <section className="pack-shelf" aria-label="Shop">
        <div className="pack-shelf__head">
          <h3 className="section-label">Featured</h3>
          <ShopRotationTimer onDayChange={onShopDayChange} />
        </div>
        <div className="pack-shelf__row">{featured.map(renderPackButton)}</div>

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
