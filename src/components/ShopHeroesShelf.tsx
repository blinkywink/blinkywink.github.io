import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { HeroEntity } from "../data/heroes";
import { heroBlurb } from "../lib/heroEffects";
import {
  HERO_EQUIP_SWAP_COST,
  HERO_MAX_LEVEL,
  HERO_UNLOCK_COST,
  buyHero,
  equipHero,
  heroClearProgressFromProfile,
  heroClearsRequiredForNextLevel,
  heroLevelFromProfile,
  heroLevelUpReady,
  heroUpgradeCost,
  normalizeHeroClearProgress,
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
  const clears = useMemo(
    () => normalizeHeroClearProgress(profile?.hero_clear_progress),
    [profile?.hero_clear_progress],
  );
  const equippedId = profile?.equipped_hero_id
    ? String(profile.equipped_hero_id).toLowerCase()
    : null;
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
    const progress = heroClearProgressFromProfile(clears, focused.id);
    if (mine && !heroLevelUpReady(level, progress)) {
      const need = heroClearsRequiredForNextLevel(level);
      setBuyError(
        `Clear ${need - progress} more game${need - progress === 1 ? "" : "s"} with ${focused.name} equipped.`,
      );
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
          : owned.size === 0
            ? `Unlocked & equipped ${focused.name}!`
            : `Unlocked ${focused.name}!`,
      );
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Purchase failed.");
    }
    setBusy(false);
  }

  async function onEquip() {
    if (!focused || busy || isGuest) return;
    if (!owned.has(focused.id)) {
      setBuyError("Unlock this hero first.");
      return;
    }
    const already = equippedId === focused.id;
    const swapCost =
      !already && equippedId && equippedId !== focused.id
        ? HERO_EQUIP_SWAP_COST
        : 0;
    if (swapCost > 0 && (profile?.coins ?? 0) < swapCost) {
      setBuyError(`Need ${swapCost.toLocaleString()} Cash to swap heroes.`);
      return;
    }
    setBusy(true);
    setBuyError(null);
    try {
      const result = await equipHero(already ? null : focused.id);
      setCoinBalance(result.coins);
      await refreshProfile();
      setStatus(
        already
          ? `${focused.name} unequipped.`
          : swapCost > 0
            ? `Equipped ${focused.name} (−${swapCost.toLocaleString()} Cash).`
            : `Equipped ${focused.name}!`,
      );
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Could not equip.");
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
  const focusProgress = focused
    ? heroClearProgressFromProfile(clears, focused.id)
    : 0;
  const focusNeed =
    focusMine && !focusMaxed
      ? heroClearsRequiredForNextLevel(focusLevel)
      : 0;
  const focusReady =
    !focusMine || focusMaxed || heroLevelUpReady(focusLevel, focusProgress);
  const focusPrice = focused
    ? focusMine
      ? focusMaxed
        ? 0
        : heroUpgradeCost(focusLevel + 1)
      : heroUpgradeCost(1)
    : 0;
  const focusEquipped = Boolean(focused && equippedId === focused.id);
  const focusSwapCost =
    focusMine && !focusEquipped && equippedId
      ? HERO_EQUIP_SWAP_COST
      : 0;
  const canBuy =
    !isGuest && focused && (!focusMine || (!focusMaxed && focusReady));

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
              {!focusMaxed && focusReady ? (
                <CurrencyChip amount={focusPrice} />
              ) : null}
              {isGuest ? (
                <p className="pack-opener__buy-note">Sign in to unlock.</p>
              ) : (
                <>
                  {focusMine ? (
                    <div className="shop-hero-focus__actions">
                      <button
                        type="button"
                        className={`btn ${focusEquipped ? "btn--secondary" : "btn--primary"} btn--lg`}
                        disabled={
                          busy ||
                          (focusSwapCost > 0 &&
                            (profile?.coins ?? 0) < focusSwapCost)
                        }
                        onClick={() => void onEquip()}
                      >
                        {busy
                          ? "…"
                          : focusEquipped
                            ? "Unequip"
                            : focusSwapCost > 0
                              ? "Equip"
                              : "Equip"}
                        {!focusEquipped && focusSwapCost > 0 ? (
                          <CashAmount amount={focusSwapCost} size={16} />
                        ) : null}
                      </button>
                      {!focusMaxed && focusReady ? (
                        <button
                          type="button"
                          className="btn btn--primary btn--lg"
                          disabled={busy || !canBuy}
                          onClick={() => void onPurchase()}
                        >
                          {busy ? "Leveling…" : "Level up · Space"}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--lg"
                      disabled={busy || !canBuy}
                      onClick={() => void onPurchase()}
                    >
                      {busy ? "Unlocking…" : "Unlock · Space"}
                    </button>
                  )}
                  {focusMine && !focusReady && !focusMaxed ? (
                    <p className="pack-opener__buy-note">
                      Clear games with {focused.name} equipped · {focusProgress}/
                      {focusNeed} to unlock level-up (
                      <CashAmount amount={focusPrice} size={13} />)
                    </p>
                  ) : null}
                  {focusMaxed ? (
                    <p className="pack-opener__buy-note">Max level</p>
                  ) : null}
                  {buyError ? (
                    <p className="pack-opener__buy-error">{buyError}</p>
                  ) : (
                    <p className="pack-opener__buy-note">
                      Balance {(profile?.coins ?? 0).toLocaleString()} Cash
                      {focusMine && focusReady && !focusMaxed
                        ? ` · Lv ${focusLevel} → ${focusLevel + 1}`
                        : ""}
                      {focusEquipped ? " · Equipped" : ""}
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
          <CashAmount amount={HERO_UNLOCK_COST} /> unlock · first unlock
          auto-equips · equip here · clear games to level up
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
          const progress = heroClearProgressFromProfile(clears, hero.id);
          const need =
            mine && !maxed ? heroClearsRequiredForNextLevel(level) : 0;
          const ready = !mine || maxed || heroLevelUpReady(level, progress);
          const isEquipped = equippedId === hero.id;
          const price = mine
            ? maxed
              ? 0
              : heroUpgradeCost(level + 1)
            : heroUpgradeCost(1);
          return (
            <button
              key={hero.id}
              type="button"
              className={`pack-shelf__item${isEquipped ? " is-equipped-hero" : ""}`}
              onClick={() => {
                setBuyError(null);
                setFocused(hero);
              }}
            >
              <HeroCardFace
                hero={hero}
                level={level}
                equipped={isEquipped}
                hideCaption
                size="lg"
                mode="preview"
              />
              <span className="pack-shelf__label">
                <strong>
                  {hero.name}
                  {isEquipped ? " ✓" : ""}
                </strong>
                <span className="pack-shelf__price">
                  {isEquipped ? (
                    "Equipped"
                  ) : maxed ? (
                    `Lv ${level} · Max`
                  ) : mine && !ready ? (
                    `${progress}/${need} clears · Lv ${level}`
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
