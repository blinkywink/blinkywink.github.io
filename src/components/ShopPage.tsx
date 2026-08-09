import { useEffect, useMemo, useState } from "react";
import {
  allCategoryPacks,
  dayStamp,
  featuredShopPacks,
  formatShopCountdown,
  msUntilShopRotation,
  packPrice,
  type PackDef,
} from "../lib/packTheme";
import type { MonkeyCardSpec } from "../lib/pathCombos";
import { useHeroFx } from "../auth/HeroFxProvider";
import { HERO_EFFECTS_L1, rollChance } from "../lib/heroEffects";
import { BoosterPack } from "./BoosterPack";
import { DailyClaimButton } from "./DailyClaimButton";
import { PackOpenerTest } from "./PackOpenerTest";
import { ShopDirectShelf } from "./ShopDirectShelf";
import { ShopHeroesShelf } from "./ShopHeroesShelf";

type Props = {
  onPackFinished?: (result: {
    pack: PackDef;
    pulls: MonkeyCardSpec[];
    unlocked: MonkeyCardSpec[];
    duplicateCash: number;
  }) => void;
};

const GERALDO_LS = "bloon-arcade:geraldo-shop-reroll";

function readGeraldoState(day: string): { available: boolean; salt: number } {
  try {
    const raw = window.localStorage.getItem(GERALDO_LS);
    if (!raw) return { available: false, salt: 0 };
    const parsed = JSON.parse(raw) as {
      day?: string;
      available?: boolean;
      salt?: number;
    };
    if (parsed.day !== day) return { available: false, salt: 0 };
    return {
      available: Boolean(parsed.available),
      salt: Math.max(0, Math.floor(Number(parsed.salt) || 0)),
    };
  } catch {
    return { available: false, salt: 0 };
  }
}

function writeGeraldoState(
  day: string,
  state: { available: boolean; salt: number },
) {
  try {
    window.localStorage.setItem(
      GERALDO_LS,
      JSON.stringify({ day, ...state }),
    );
  } catch {
    // ignore
  }
}

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
  const { equipped, notifyHeroProc } = useHeroFx();
  const [rerollSalt, setRerollSalt] = useState(0);
  const [rerollAvailable, setRerollAvailable] = useState(false);

  useEffect(() => {
    const saved = readGeraldoState(shopDay);
    setRerollSalt(saved.salt);
    if (saved.available) {
      setRerollAvailable(true);
      return;
    }
    if (
      equipped?.heroId === "geraldo" &&
      saved.salt === 0 &&
      !saved.available
    ) {
      const key = `${GERALDO_LS}:rolled:${shopDay}`;
      let alreadyRolled = false;
      try {
        alreadyRolled = window.localStorage.getItem(key) === "1";
      } catch {
        // ignore
      }
      if (!alreadyRolled) {
        const ok = rollChance(HERO_EFFECTS_L1.geraldo.shopRerollChance);
        try {
          window.localStorage.setItem(key, "1");
        } catch {
          // ignore
        }
        writeGeraldoState(shopDay, { available: ok, salt: 0 });
        setRerollAvailable(ok);
        if (ok) {
          notifyHeroProc({
            heroId: "geraldo",
            message: "Geraldo: featured tower reroll ready",
          });
        }
      } else {
        setRerollAvailable(false);
      }
    } else {
      setRerollAvailable(false);
    }
  }, [shopDay, equipped?.heroId, notifyHeroProc]);

  const featured = useMemo(
    () => featuredShopPacks(shopDay, rerollSalt),
    [shopDay, rerollSalt],
  );
  const categories = useMemo(() => allCategoryPacks(), []);

  function onRerollFeatured() {
    if (!rerollAvailable) return;
    const next = rerollSalt + 1;
    setRerollSalt(next);
    setRerollAvailable(false);
    writeGeraldoState(shopDay, { available: false, salt: next });
    notifyHeroProc({
      heroId: "geraldo",
      message: "Geraldo: featured towers rerolled",
    });
  }

  const renderPackButton = (pack: PackDef) => {
    const price = packPrice(pack);
    return (
      <button
        key={pack.id}
        type="button"
        className="pack-shelf__item"
        onClick={() => setActivePack(pack)}
      >
        <BoosterPack
          pack={pack}
          effects={false}
          className="pack-shelf__booster"
        />
        <span className="pack-shelf__label">
          <strong>{pack.title}</strong>
          <span className="pack-shelf__price">
            <img
              src="/images/ui/money-icon.webp"
              alt=""
              width={22}
              height={22}
            />
            {price.toLocaleString()}
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
        {rerollAvailable ? (
          <div className="shop-geraldo-reroll">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onRerollFeatured}
            >
              Reroll featured tower packs
            </button>
          </div>
        ) : null}
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
