import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { HeroEntity } from "../data/heroes";
import { heroBlurb } from "../lib/heroEffects";
import {
  buyHero,
  heroLevelFromProfile,
  heroUpgradeCost,
  normalizeHeroLevels,
  normalizeOwnedHeroIds,
  shoppableHeroes,
} from "../lib/profileHeroes";
import {
  playBuy,
  playCardFocus,
  playHeroEquip,
  preloadHeroEquipVo,
  preloadPackSounds,
} from "../lib/packSounds";
import { isTypingTarget } from "../lib/keyboard";
import { CashAmount } from "./CurrencyChip";
import { HeroCardFace } from "./HeroCollectionStrip";

/** Shop shelf: unlock base heroes only. Level-up / equip live on Cards → Heroes. */
export function ShopHeroesShelf() {
  const { isGuest, profile, setCoinBalance, refreshProfile } = useAuth();
  const [focused, setFocused] = useState<HeroEntity | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) return;
    preloadPackSounds();
    preloadHeroEquipVo(focused.id);
  }, [focused]);

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

  async function onUnlock() {
    if (!focused || busy) return;
    if (isGuest) {
      setBuyError("Sign in to unlock heroes.");
      return;
    }
    if (owned.has(focused.id)) return;
    const price = heroUpgradeCost(1, focused.id);
    if ((profile?.coins ?? 0) < price) {
      setBuyError("Not enough Cash.");
      return;
    }
    setBusy(true);
    setBuyError(null);
    try {
      const result = await buyHero(focused.id, { expectedCost: price });
      playBuy();
      if (owned.size === 0) playHeroEquip(focused.id);
      setCoinBalance(result.coins);
      await refreshProfile();
      setStatus(
        owned.size === 0
          ? `Unlocked & equipped ${focused.name}!`
          : `Unlocked ${focused.name}!`,
      );
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
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.repeat || busy || owned.has(focused.id)) return;
      void onUnlock();
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
  const focusPrice = focused ? heroUpgradeCost(1, focused.id) : 0;
  const canBuy = !isGuest && focused && !focusMine;

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
            <div className="card-focus__face">
              <button
                type="button"
                className="btn btn--ghost btn--sm card-focus__close"
                aria-label="Close"
                disabled={busy}
                onClick={closeFocus}
              >
                ✕
              </button>
              <HeroCardFace
                hero={focused}
                level={focusLevel}
                size="lg"
                mode="focus"
                hideCaption
              />
            </div>
            <h2 className="shop-hero-focus__name">{focused.name}</h2>
            <p className="shop-hero-focus__blurb">
              {heroBlurb(focused.id, focusLevel)}
            </p>
            <div className="pack-opener__buy shop-hero-focus__buy">
              {isGuest ? (
                <p className="pack-opener__buy-note">Sign in to unlock.</p>
              ) : focusMine ? (
                <p className="pack-opener__buy-note">
                  Owned · Lv {focusLevel}. Equip & level up on Cards → Heroes.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={busy || !canBuy}
                    onClick={() => void onUnlock()}
                  >
                    {busy ? (
                      "Unlocking…"
                    ) : (
                      <>
                        Unlock for <CashAmount amount={focusPrice} size={22} />
                      </>
                    )}
                  </button>
                  {buyError ? (
                    <p className="pack-opener__buy-error">{buyError}</p>
                  ) : null}
                </>
              )}
              {focusMine && buyError ? (
                <p className="pack-opener__buy-error">{buyError}</p>
              ) : null}
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
      </div>
      {status ? (
        <p className="shop-direct__banner shop-direct__banner--ok">{status}</p>
      ) : null}
      <p className="shop-heroes__hint">
        Unlock here · equip & upgrade on Cards → Heroes
      </p>
      <div className="pack-shelf__row shop-heroes__row">
        {heroes.map((hero) => {
          const mine = owned.has(hero.id);
          const level = mine ? heroLevelFromProfile(levels, hero.id) : 1;
          const price = heroUpgradeCost(1, hero.id);
          return (
            <button
              key={hero.id}
              type="button"
              className="pack-shelf__item"
              onClick={() => {
                setBuyError(null);
                playCardFocus();
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
                  {mine ? (
                    `Owned · Lv ${level}`
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
        })}
      </div>
      {focusPortal}
    </div>
  );
}
