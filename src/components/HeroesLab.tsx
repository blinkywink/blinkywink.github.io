import { useEffect, useMemo, useState } from "react";
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

type Props = {
  onBack: () => void;
};

/** Full-page hero manage / upgrade screen (Collection → Heroes). */
export function HeroesLab({ onBack }: Props) {
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

  const ownedHeroes = useMemo(
    () => heroes.filter((h) => owned.has(h.id)),
    [heroes, owned],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selected: HeroEntity | null = useMemo(() => {
    const id = selectedId ?? ownedHeroes[0]?.id ?? heroes[0]?.id ?? null;
    return heroes.find((h) => h.id === id) ?? null;
  }, [selectedId, ownedHeroes, heroes]);

  useEffect(() => {
    if (!selected) return;
    preloadPackSounds();
    preloadHeroEquipVo(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (busy) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onBack]);

  const mine = selected ? owned.has(selected.id) : false;
  const level = selected
    ? mine
      ? heroLevelFromProfile(levels, selected.id)
      : 1
    : 1;
  const maxed = mine && level >= HERO_MAX_LEVEL;
  const progress = selected
    ? heroClearProgressFromProfile(clears, selected.id)
    : 0;
  const need =
    mine && !maxed ? heroClearsRequiredForNextLevel(level) : 0;
  const ready = !mine || maxed || heroLevelUpReady(level, progress);
  const upgradePrice =
    mine && !maxed ? heroUpgradeCost(level + 1, selected!.id) : 0;
  const equipped = Boolean(selected && equippedId === selected.id);
  const equipCost = mine && !equipped ? HERO_EQUIP_SWAP_COST : 0;
  const fillPct =
    need > 0 ? Math.min(100, (progress / need) * 100) : maxed ? 100 : 0;

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
      const nextLevel = result.heroLevels[selected.id] ?? level + 1;
      setStatus(`${selected.name} leveled to ${nextLevel}!`);
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

  return (
    <div className="card-lab heroes-lab">
      <div className="card-lab__atmosphere" aria-hidden="true" />
      <header className="card-lab__header">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={onBack}
        >
          ← Towers
        </button>
        <div className="card-lab__titles card-lab__titles--tower">
          <p className="eyebrow">Collection</p>
          <h1>Heroes</h1>
          <p className="card-lab__blurb">
            {ownedHeroes.length === 0
              ? "Unlock heroes in the shop, then equip and level them here."
              : `${ownedHeroes.length} / ${heroes.length} unlocked · clear games to unlock level-ups.`}
          </p>
        </div>
      </header>

      {status ? (
        <p className="shop-direct__banner shop-direct__banner--ok heroes-lab__banner">
          {status}
        </p>
      ) : null}

      <div className="heroes-lab__picker" role="list">
        {heroes.map((hero) => {
          const isMine = owned.has(hero.id);
          const lv = isMine ? heroLevelFromProfile(levels, hero.id) : 1;
          const isSel = selected?.id === hero.id;
          const isEq = equippedId === hero.id;
          const prog = heroClearProgressFromProfile(clears, hero.id);
          const req =
            isMine && lv < HERO_MAX_LEVEL
              ? heroClearsRequiredForNextLevel(lv)
              : 0;
          return (
            <button
              key={hero.id}
              type="button"
              role="listitem"
              className={[
                "heroes-lab__pick",
                isSel ? "is-selected" : "",
                isEq ? "is-equipped" : "",
                !isMine ? "is-locked" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setError(null);
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
              <span className="heroes-lab__pick-meta">
                <strong>
                  {hero.name}
                  {isEq ? " ✓" : ""}
                </strong>
                <span>
                  {!isMine
                    ? "Locked"
                    : lv >= HERO_MAX_LEVEL
                      ? `Lv ${lv} · Max`
                      : `Lv ${lv} · ${prog}/${req}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <section className="heroes-lab__detail" aria-label={selected.name}>
          <div className="heroes-lab__stage">
            <HeroCardFace
              hero={selected}
              level={level}
              size="lg"
              mode="focus"
              hideCaption
            />
          </div>

          <div className="heroes-lab__info">
            <p className="eyebrow">
              {mine
                ? equipped
                  ? "Equipped"
                  : "Owned"
                : "Locked"}
            </p>
            <h2 className="heroes-lab__name">{selected.name}</h2>
            <p className="heroes-lab__blurb">
              {heroBlurb(selected.id, level)}
            </p>

            {mine ? (
              <>
                <div className="heroes-lab__stats">
                  <div className="heroes-lab__stat">
                    <span className="heroes-lab__stat-label">Level</span>
                    <strong className="heroes-lab__stat-value">
                      {level}
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
                    Level-up costs{" "}
                    <CashAmount amount={upgradePrice} size={14} />.
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
                  {!maxed ? (
                    <button
                      type="button"
                      className="btn btn--primary btn--lg"
                      disabled={
                        busy ||
                        !ready ||
                        (profile?.coins ?? 0) < upgradePrice
                      }
                      onClick={() => void onLevelUp()}
                    >
                      {busy ? "Leveling…" : "Level up"}
                      {ready ? (
                        <CashAmount amount={upgradePrice} size={16} />
                      ) : null}
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
                . Upgrades live here after you own them.
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
        </section>
      ) : null}
    </div>
  );
}
