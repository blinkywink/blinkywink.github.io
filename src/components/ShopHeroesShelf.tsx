import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { HeroEntity } from "../data/heroes";
import { heroBlurb } from "../lib/heroEffects";
import {
  HERO_MAX_LEVEL,
  HERO_UNLOCK_COST,
  buyHero,
  heroLevelFromProfile,
  heroUpgradeCost,
  normalizeHeroLevels,
  normalizeOwnedHeroIds,
  shoppableHeroes,
} from "../lib/profileHeroes";
import { CashAmount, CurrencyChip } from "./CurrencyChip";
import { HeroCardFace } from "./HeroCollectionStrip";

export function ShopHeroesShelf() {
  const { isGuest, profile, setCoinBalance, refreshProfile } = useAuth();
  const [focused, setFocused] = useState<HeroEntity | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const owned = useMemo(
    () => new Set(normalizeOwnedHeroIds(profile?.owned_hero_ids)),
    [profile?.owned_hero_ids],
  );
  const levels = useMemo(
    () => normalizeHeroLevels(profile?.hero_levels),
    [profile?.hero_levels],
  );
  const heroes = useMemo(() => shoppableHeroes(), []);

  function closeFocus() {
    if (busy) return;
    setFocused(null);
    setBuyError(null);
  }

  async function onPurchase() {
    if (!focused || busy) return;
    if (isGuest) {
      setBuyError("Sign in to unlock or level heroes.");
      return;
    }
    const mine = owned.has(focused.id);
    const level = heroLevelFromProfile(levels, focused.id);
    if (mine && level >= HERO_MAX_LEVEL) {
      setBuyError("Already max level.");
      return;
    }
    const price = mine ? heroUpgradeCost(level + 1) : heroUpgradeCost(1);
    if ((profile?.coins ?? 0) < price) {
      setBuyError("Not enough Cash.");
      return;
    }
    setBusy(true);
    setBuyError(null);
    try {
      const result = await buyHero(focused.id, { expectedCost: price });
      setCoinBalance(result.coins);
      await refreshProfile();
      const nextLevel = result.heroLevels[focused.id] ?? (mine ? level + 1 : 1);
      setStatus(
        mine
          ? `${focused.name} leveled to ${nextLevel}!`
          : `Unlocked ${focused.name}!`,
      );
      // Keep focus open so they can preview the new level / buy again.
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Purchase failed.");
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (busy) return;
        e.preventDefault();
        closeFocus();
        return;
      }
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (e.repeat || busy) return;
      void onPurchase();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  });

  const focusMine = focused ? owned.has(focused.id) : false;
  const focusLevel = focused
    ? focusMine
      ? heroLevelFromProfile(levels, focused.id)
      : 1
    : 1;
  const focusMaxed = focusMine && focusLevel >= HERO_MAX_LEVEL;
  const focusPrice = focused
    ? focusMine
      ? focusMaxed
        ? 0
        : heroUpgradeCost(focusLevel + 1)
      : heroUpgradeCost(1)
    : 0;
  const canBuy =
    !isGuest && focused && (!focusMine || !focusMaxed);

  const focusPortal = focused
    ? createPortal(
        <div
          className="card-focus shop-hero-focus"
          role="dialog"
          aria-modal="true"
          aria-label={focused.name}
        >
          <button
            type="button"
            className="card-focus__backdrop"
            aria-label="Close"
            disabled={busy}
            onClick={closeFocus}
          />
          <div className="card-focus__panel shop-hero-focus__panel">
            <button
              type="button"
              className="btn btn--ghost btn--sm card-focus__close"
              disabled={busy}
              onClick={closeFocus}
            >
              ✕ Close
            </button>
            <HeroCardFace
              hero={focused}
              level={focusLevel}
              size="lg"
              mode="focus"
              hideCaption
            />
            <h2 className="shop-hero-focus__name">{focused.name}</h2>
            <p className="shop-hero-focus__blurb">
              {heroBlurb(focused.id, focusLevel)}
            </p>
            <div className="pack-opener__buy shop-hero-focus__buy">
              {!focusMaxed ? (
                <CurrencyChip amount={focusPrice} />
              ) : null}
              {isGuest ? (
                <p className="pack-opener__buy-note">Sign in to unlock.</p>
              ) : focusMaxed ? (
                <p className="pack-opener__buy-note">
                  Max level · equip on Profile
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={busy || !canBuy}
                    onClick={() => void onPurchase()}
                  >
                    {busy
                      ? focusMine
                        ? "Leveling…"
                        : "Unlocking…"
                      : focusMine
                        ? `Level up · Space`
                        : "Unlock · Space"}
                  </button>
                  {buyError ? (
                    <p className="pack-opener__buy-error">{buyError}</p>
                  ) : (
                    <p className="pack-opener__buy-note">
                      Balance {(profile?.coins ?? 0).toLocaleString()} Cash
                      {focusMine
                        ? ` · Lv ${focusLevel} → ${focusLevel + 1}`
                        : ""}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="shop-heroes">
      <div className="pack-shelf__head pack-shelf__head--sub">
        <h3 className="section-label">Heroes</h3>
        <p className="shop-heroes__note">
          <CashAmount amount={HERO_UNLOCK_COST} /> unlock · each level costs
          more · equip on Profile
        </p>
      </div>
      {status ? (
        <p className="shop-direct__banner shop-direct__banner--ok">{status}</p>
      ) : null}
      <div className="pack-shelf__row shop-heroes__row">
        {heroes.map((hero) => {
          const mine = owned.has(hero.id);
          const level = mine ? heroLevelFromProfile(levels, hero.id) : 1;
          const maxed = mine && level >= HERO_MAX_LEVEL;
          const price = mine
            ? maxed
              ? 0
              : heroUpgradeCost(level + 1)
            : heroUpgradeCost(1);
          return (
            <button
              key={hero.id}
              type="button"
              className="pack-shelf__item"
              onClick={() => {
                setBuyError(null);
                setFocused(hero);
              }}
            >
              <HeroCardFace
                hero={hero}
                level={level}
                hideCaption
                size="lg"
                mode="preview"
              />
              <span className="pack-shelf__label">
                <strong>{hero.name}</strong>
                <span className="pack-shelf__price">
                  {maxed ? (
                    `Lv ${level} · Max`
                  ) : (
                    <>
                      <img
                        src="/images/ui/money-icon.webp"
                        alt=""
                        width={22}
                        height={22}
                      />
                      {price.toLocaleString()}
                      {mine ? ` · Lv ${level}` : ""}
                    </>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {focusPortal}
    </div>
  );
}
