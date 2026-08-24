import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import type { HeroEntity } from "../data/heroes";
import { heroBlurb } from "../lib/heroEffects";
import {
  HERO_EQUIP_SWAP_COST,
  HERO_MAX_LEVEL,
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
import {
  playBuy,
  playCardFocus,
  playHeroEquip,
  preloadHeroEquipVo,
  preloadPackSounds,
} from "../lib/packSounds";
import { CashAmount } from "./CurrencyChip";
import { HeroCardFace } from "./HeroCollectionStrip";

/** Milestone looks shown in the hero focus strip. */
const LOOK_LEVELS = [1, 5, 10, 15, 20] as const;

/** Milestone strip plus current level when it isn't already one of those. */
function previewStripLevels(currentLevel: number): number[] {
  const cur = Math.max(
    1,
    Math.min(HERO_MAX_LEVEL, Math.floor(currentLevel) || 1),
  );
  const levels = new Set<number>(LOOK_LEVELS);
  levels.add(cur);
  return [...levels].sort((a, b) => a - b);
}

export type HeroesViewer = {
  username: string;
  ownedHeroIds?: string[] | null;
  equippedHeroId?: string | null;
  heroLevels?: Record<string, number> | null;
};

type Props = {
  onBack: () => void;
  initialHeroId?: string;
};

/** Shop-style grid + fullscreen card for someone else's heroes. */
export function RemoteHeroesBrowse({
  viewer,
  onBack,
  initialHeroId,
}: {
  viewer: HeroesViewer;
  onBack: () => void;
  initialHeroId?: string;
}) {
  const heroes = useMemo(() => shoppableHeroes(), []);
  const owned = useMemo(
    () => new Set(normalizeOwnedHeroIds(viewer.ownedHeroIds)),
    [viewer.ownedHeroIds],
  );
  const levels = useMemo(
    () => normalizeHeroLevels(viewer.heroLevels),
    [viewer.heroLevels],
  );
  const equippedId = viewer.equippedHeroId
    ? String(viewer.equippedHeroId).toLowerCase()
    : null;

  const ownedHeroes = useMemo(
    () => heroes.filter((h) => owned.has(h.id)),
    [heroes, owned],
  );

  const [focusedId, setFocusedId] = useState<string | null>(
    () => initialHeroId?.toLowerCase() ?? null,
  );

  useEffect(() => {
    if (initialHeroId) setFocusedId(initialHeroId.toLowerCase());
  }, [initialHeroId]);

  const focused = useMemo(() => {
    if (!focusedId) return null;
    return ownedHeroes.find((h) => h.id === focusedId) ?? null;
  }, [focusedId, ownedHeroes]);

  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setFocusedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [focused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || focused) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, onBack]);

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
            onClick={() => setFocusedId(null)}
          />
          <div className="card-focus__panel shop-hero-focus__panel">
            <div className="card-focus__face">
              <button
                type="button"
                className="btn btn--ghost btn--sm card-focus__close"
                aria-label="Close"
                onClick={() => setFocusedId(null)}
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
              Lv {focusLevel}
              {equippedId === focused.id ? " · Equipped" : ""}
            </p>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="card-lab heroes-lab heroes-lab--remote">
      <header className="card-lab__header">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onBack}
        >
          ← Cards
        </button>
        <div className="card-lab__titles card-lab__titles--tower">
          <h1>{viewer.username}&apos;s Heroes</h1>
          <p className="card-lab__blurb">
            {ownedHeroes.length === 0
              ? "No heroes unlocked yet."
              : `${ownedHeroes.length} unlocked · tap a card to view.`}
          </p>
        </div>
      </header>

      {ownedHeroes.length > 0 ? (
        <div className="heroes-lab__browse-grid">
          {ownedHeroes.map((hero) => {
            const lv = heroLevelFromProfile(levels, hero.id);
            const isEq = equippedId === hero.id;
            return (
              <button
                key={hero.id}
                type="button"
                className={`heroes-lab__browse-card${isEq ? " is-equipped" : ""}`}
                onClick={() => {
                  playCardFocus();
                  setFocusedId(hero.id);
                }}
              >
                <HeroCardFace
                  hero={hero}
                  level={lv}
                  equipped={isEq}
                  hideCaption
                  size="md"
                  mode="preview"
                />
              </button>
            );
          })}
        </div>
      ) : null}
      {focusPortal}
    </div>
  );
}

/** Full-page hero manage / upgrade screen (Collection → Heroes). */
export function HeroesLab({ onBack, initialHeroId }: Props) {
  const { isGuest, profile, setCoinBalance, refreshProfile } = useAuth();
  const heroes = useMemo(() => shoppableHeroes(), []);
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

  const ownedCount = heroes.filter((h) => owned.has(h.id)).length;

  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialHeroId?.toLowerCase() ?? null,
  );
  const [previewLevel, setPreviewLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selected: HeroEntity | null = useMemo(() => {
    if (!selectedId) return null;
    return heroes.find((h) => h.id === selectedId) ?? null;
  }, [selectedId, heroes]);

  useEffect(() => {
    if (initialHeroId) setSelectedId(initialHeroId.toLowerCase());
  }, [initialHeroId]);

  useEffect(() => {
    if (!selected) return;
    preloadPackSounds();
    preloadHeroEquipVo(selected.id);
    setPreviewLevel(null);
    setError(null);
  }, [selected?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (busy) return;
      e.preventDefault();
      if (selected) {
        setSelectedId(null);
        return;
      }
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onBack, selected]);

  const mine = selected ? owned.has(selected.id) : false;
  const realLevel = selected
    ? mine
      ? heroLevelFromProfile(levels, selected.id)
      : 1
    : 1;
  const displayLevel = previewLevel ?? realLevel;
  const maxed = mine && realLevel >= HERO_MAX_LEVEL;
  const progress = selected
    ? heroClearProgressFromProfile(clears, selected.id)
    : 0;
  const need =
    mine && !maxed ? heroClearsRequiredForNextLevel(realLevel) : 0;
  const ready = Boolean(
    mine && !maxed && heroLevelUpReady(realLevel, progress),
  );
  const upgradePrice =
    mine && !maxed && selected
      ? heroUpgradeCost(realLevel + 1, selected.id)
      : 0;
  const equipped = Boolean(selected && equippedId === selected.id);
  const equipCost = mine && !equipped ? HERO_EQUIP_SWAP_COST : 0;
  const fillPct =
    need > 0 ? Math.min(100, (progress / need) * 100) : maxed ? 100 : 0;
  const stripLevels = useMemo(
    () => previewStripLevels(realLevel),
    [realLevel],
  );
  const previewingOther =
    previewLevel != null && previewLevel !== realLevel;
  const previewingFuture = previewingOther && previewLevel > realLevel;

  async function onLevelUp() {
    if (!selected || busy || isGuest || !mine || maxed) return;
    if (!ready) {
      setError(
        `Clear ${need - progress} more game${need - progress === 1 ? "" : "s"} with ${selected.name} equipped.`,
      );
      return;
    }
    if ((profile?.coins ?? 0) < upgradePrice) {
      setError("Not enough Cash.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await buyHero(selected.id, {
        expectedCost: upgradePrice,
      });
      playBuy();
      setCoinBalance(result.coins);
      await refreshProfile();
      const nextLevel = result.heroLevels[selected.id] ?? realLevel + 1;
      setStatus(`${selected.name} leveled to ${nextLevel}!`);
      setPreviewLevel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Level-up failed.");
    }
    setBusy(false);
  }

  async function onEquip() {
    if (!selected || busy || isGuest || !mine) return;
    const already = equipped;
    const cost = !already ? HERO_EQUIP_SWAP_COST : 0;
    if (cost > 0 && (profile?.coins ?? 0) < cost) {
      setError(`Need ${cost.toLocaleString()} Cash to equip a hero.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await equipHero(already ? null : selected.id);
      setCoinBalance(result.coins);
      await refreshProfile();
      if (!already) playHeroEquip(selected.id);
      setStatus(
        already
          ? `${selected.name} unequipped.`
          : `Equipped ${selected.name} (−${cost.toLocaleString()} Cash).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not equip.");
    }
    setBusy(false);
  }

  // ——— Detail focus ———
  if (selected) {
    return (
      <div className="card-lab heroes-lab heroes-lab--focus">
        <header className="card-lab__header">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => setSelectedId(null)}
          >
            ← Heroes
          </button>
          <div className="card-lab__titles card-lab__titles--tower">
            <p className="eyebrow">
              {mine ? (equipped ? "Equipped" : "Owned") : "Locked"}
              {previewingOther ? ` · Preview Lv ${displayLevel}` : ""}
            </p>
            <h1>{selected.name}</h1>
          </div>
        </header>

        {status ? (
          <p className="shop-direct__banner shop-direct__banner--ok heroes-lab__banner">
            {status}
          </p>
        ) : null}

        <div className="heroes-lab__focus">
          <div className="heroes-lab__stage">
            <HeroCardFace
              hero={selected}
              level={displayLevel}
              size="lg"
              mode="focus"
              hideCaption
            />
            {previewingOther ? (
              <p className="heroes-lab__preview-tag">
                Preview · Lv {displayLevel}
                {previewingFuture ? ` · current Lv ${realLevel}` : ""}
              </p>
            ) : null}
          </div>

          <div className="heroes-lab__info">
            <p className="heroes-lab__blurb">
              {heroBlurb(selected.id, displayLevel)}
            </p>

            <div
              className="heroes-lab__previews"
              role="group"
              aria-label="Level looks"
            >
              <p className="heroes-lab__previews-label">Looks</p>
              <div className="heroes-lab__previews-row">
                {stripLevels.map((lv) => {
                  const isCurrent = lv === realLevel;
                  const isActive =
                    previewLevel === lv ||
                    (previewLevel == null && isCurrent);
                  return (
                    <button
                      key={lv}
                      type="button"
                      className={`heroes-lab__preview-btn${isActive ? " is-active" : ""}${lv <= realLevel ? " is-unlocked" : ""}${isCurrent ? " is-current" : ""}`}
                      aria-pressed={isActive}
                      aria-label={
                        isCurrent
                          ? `Level ${lv}, your current level`
                          : `Preview level ${lv}`
                      }
                      onClick={() => {
                        playCardFocus();
                        setPreviewLevel(isCurrent ? null : lv);
                      }}
                    >
                      <HeroCardFace
                        hero={selected}
                        level={lv}
                        size="sm"
                        mode="preview"
                        hideCaption
                      />
                      <span className="heroes-lab__preview-btn-label">
                        {isCurrent ? (
                          <>
                            Lv {lv}
                            <em>You</em>
                          </>
                        ) : (
                          <>Lv {lv}</>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {mine ? (
              <>
                <div className="heroes-lab__stats">
                  <div className="heroes-lab__stat">
                    <span className="heroes-lab__stat-label">Level</span>
                    <strong className="heroes-lab__stat-value">
                      {realLevel}
                      <span> / {HERO_MAX_LEVEL}</span>
                    </strong>
                  </div>
                  {!maxed ? (
                    <div className="heroes-lab__stat heroes-lab__stat--wide">
                      <span className="heroes-lab__stat-label">
                        Clears to next level
                      </span>
                      <div className="heroes-lab__xp">
                        <div className="heroes-lab__xp-meta">
                          <span>
                            {progress} / {need}
                          </span>
                          {ready ? (
                            <span className="heroes-lab__ready">Ready</span>
                          ) : null}
                        </div>
                        <div className="heroes-lab__xp-bar" aria-hidden>
                          <span
                            className="heroes-lab__xp-fill"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="heroes-lab__stat">
                      <span className="heroes-lab__stat-label">Progress</span>
                      <strong className="heroes-lab__stat-value">Maxed</strong>
                    </div>
                  )}
                </div>

                {!maxed && !ready ? (
                  <p className="heroes-lab__hint">
                    Clear games with {selected.name} equipped to fill the bar.
                  </p>
                ) : null}

                <div className="heroes-lab__actions">
                  <button
                    type="button"
                    className={`btn ${equipped ? "btn--secondary" : "btn--primary"} btn--lg`}
                    disabled={
                      busy ||
                      (equipCost > 0 && (profile?.coins ?? 0) < equipCost)
                    }
                    onClick={() => void onEquip()}
                  >
                    {busy ? "…" : equipped ? "Unequip" : "Equip"}
                    {!equipped ? (
                      <CashAmount amount={equipCost} size={16} />
                    ) : null}
                  </button>
                  {ready ? (
                    <button
                      type="button"
                      className="btn btn--primary btn--lg"
                      disabled={
                        busy || (profile?.coins ?? 0) < upgradePrice
                      }
                      onClick={() => void onLevelUp()}
                    >
                      {busy ? "Leveling…" : "Level up"}
                      <CashAmount amount={upgradePrice} size={16} />
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="heroes-lab__hint">
                Unlock {selected.name} in the Shop for{" "}
                <CashAmount
                  amount={heroUpgradeCost(1, selected.id)}
                  size={14}
                />
                . Come back here to equip and level up.
              </p>
            )}

            {error ? (
              <p className="pack-opener__buy-error">{error}</p>
            ) : (
              <p className="heroes-lab__balance">
                Balance {(profile?.coins ?? 0).toLocaleString()} Cash
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ——— Grid ———
  return (
    <div className="card-lab heroes-lab">
      <header className="card-lab__header">
        <div className="card-lab__titles card-lab__titles--tower">
          <h1>Heroes</h1>
          <p className="card-lab__blurb">
            {ownedCount === 0
              ? "Unlock heroes in the shop, then equip and level them here."
              : `${ownedCount} / ${heroes.length} unlocked · tap a hero to upgrade.`}
          </p>
        </div>
      </header>

      {status ? (
        <p className="shop-direct__banner shop-direct__banner--ok heroes-lab__banner">
          {status}
        </p>
      ) : null}

      <div className="heroes-lab__grid">
        {heroes.map((hero) => {
          const isMine = owned.has(hero.id);
          const lv = isMine ? heroLevelFromProfile(levels, hero.id) : 1;
          const isEq = equippedId === hero.id;
          const prog = heroClearProgressFromProfile(clears, hero.id);
          const req =
            isMine && lv < HERO_MAX_LEVEL
              ? heroClearsRequiredForNextLevel(lv)
              : 0;
          const isReady =
            isMine && lv < HERO_MAX_LEVEL && heroLevelUpReady(lv, prog);
          return (
            <button
              key={hero.id}
              type="button"
              className={[
                "heroes-lab__card",
                isEq ? "is-equipped" : "",
                !isMine ? "is-locked" : "",
                isReady ? "is-ready" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                playCardFocus();
                setSelectedId(hero.id);
              }}
            >
              <HeroCardFace
                hero={hero}
                level={lv}
                equipped={isEq}
                hideCaption
                size="md"
                mode="preview"
              />
              <span className="heroes-lab__card-meta">
                <strong>
                  {hero.name}
                  {isEq ? " ✓" : ""}
                </strong>
                <span>
                  {!isMine
                    ? "Locked · Shop"
                    : lv >= HERO_MAX_LEVEL
                      ? `Lv ${lv} · Max`
                      : isReady
                        ? `Lv ${lv} · Ready!`
                        : `Lv ${lv} · ${prog}/${req}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
