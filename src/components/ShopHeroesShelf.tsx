import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { HeroEntity } from "../data/heroes";
import { heroBlurb } from "../lib/heroEffects";
import {
  HERO_UNLOCK_COST,
  buyHero,
  heroLevelFromProfile,
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
      setBuyError("Sign in to unlock heroes.");
      return;
    }
    if (owned.has(focused.id)) {
      setBuyError("You already own that hero.");
      return;
    }
    if ((profile?.coins ?? 0) < HERO_UNLOCK_COST) {
      setBuyError("Not enough Cash.");
      return;
    }
    setBusy(true);
    setBuyError(null);
    try {
      const result = await buyHero(focused.id);
      setCoinBalance(result.coins);
      await refreshProfile();
      setStatus(`Unlocked ${focused.name}!`);
      setFocused(null);
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  });

  const focusMine = focused ? owned.has(focused.id) : false;
  const focusLevel = focused
    ? heroLevelFromProfile(levels, focused.id)
    : 1;

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
              level={focusMine ? focusLevel : 1}
              size="md"
              locked={!focusMine}
              hideLevel={!focusMine}
              hideCaption
            />
            <h2 className="shop-hero-focus__name">{focused.name}</h2>
            <p className="shop-hero-focus__blurb">{heroBlurb(focused.id)}</p>
            <div className="pack-opener__buy shop-hero-focus__buy">
              {!focusMine ? <CurrencyChip amount={HERO_UNLOCK_COST} /> : null}
              {isGuest ? (
                <p className="pack-opener__buy-note">Sign in to unlock.</p>
              ) : focusMine ? (
                <p className="pack-opener__buy-note">Already owned · equip on Profile</p>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={busy}
                    onClick={() => void onPurchase()}
                  >
                    {busy ? "Unlocking…" : "Unlock"}
                  </button>
                  {buyError ? (
                    <p className="pack-opener__buy-error">{buyError}</p>
                  ) : (
                    <p className="pack-opener__buy-note">
                      Balance {(profile?.coins ?? 0).toLocaleString()} Cash
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
          Unlock <CashAmount amount={HERO_UNLOCK_COST} /> · equip on Profile
        </p>
      </div>
      {status ? (
        <p className="shop-direct__banner shop-direct__banner--ok">{status}</p>
      ) : null}
      <div className="pack-shelf__row shop-heroes__row">
        {heroes.map((hero) => {
          const mine = owned.has(hero.id);
          const level = heroLevelFromProfile(levels, hero.id);
          return (
            <button
              key={hero.id}
              type="button"
              className={`pack-shelf__item${mine ? " is-owned" : ""}`}
              onClick={() => {
                setBuyError(null);
                setFocused(hero);
              }}
            >
              <HeroCardFace
                hero={hero}
                level={mine ? level : 1}
                locked={!mine}
                hideLevel={!mine}
                hideCaption
                size="md"
              />
              <span className="pack-shelf__label">
                <strong>{hero.name}</strong>
                <span className="pack-shelf__price">
                  {mine ? (
                    "Owned"
                  ) : (
                    <>
                      <img
                        src="/images/ui/money-icon.webp"
                        alt=""
                        width={22}
                        height={22}
                      />
                      {HERO_UNLOCK_COST.toLocaleString()}
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
