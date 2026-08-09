import { useMemo, type ReactNode } from "react";
import {
  heroById,
  heroPortraitForLevel,
  type HeroEntity,
} from "../data/heroes";
import {
  heroLevelFromProfile,
  normalizeHeroLevels,
  normalizeOwnedHeroIds,
  shoppableHeroes,
} from "../lib/profileHeroes";

type Levels = Record<string, number> | null | undefined;

/** Compact equipped-hero chip for public player pages. */
export function EquippedHeroPanel({
  equippedHeroId,
  heroLevels,
  className = "",
}: {
  equippedHeroId?: string | null;
  heroLevels?: Levels;
  className?: string;
}) {
  const levels = useMemo(() => normalizeHeroLevels(heroLevels), [heroLevels]);
  const id = equippedHeroId?.trim().toLowerCase() || null;
  const hero = id ? heroById(id) : null;
  if (!hero) return null;
  const level = heroLevelFromProfile(levels, hero.id);
  return (
    <p className={`equipped-hero ${className}`.trim()}>
      <img
        src={heroPortraitForLevel(hero, level)}
        alt=""
        className="equipped-hero__img"
      />
      <span>
        Equipped <strong>{hero.name}</strong>
        <span className="equipped-hero__lvl">Lv {level}</span>
      </span>
    </p>
  );
}

/** Owned-hero gallery for Collection (read-only display). */
export function HeroCollectionShelf({
  ownedHeroIds,
  equippedHeroId,
  heroLevels,
  className = "",
}: {
  ownedHeroIds?: string[] | null;
  equippedHeroId?: string | null;
  heroLevels?: Levels;
  className?: string;
}) {
  const owned = useMemo(
    () => normalizeOwnedHeroIds(ownedHeroIds),
    [ownedHeroIds],
  );
  const levels = useMemo(() => normalizeHeroLevels(heroLevels), [heroLevels]);
  const equipped = equippedHeroId?.trim().toLowerCase() || null;
  const heroes = useMemo(
    () => shoppableHeroes().filter((h) => owned.includes(h.id)),
    [owned],
  );

  return (
    <section className={`hero-shelf ${className}`.trim()} aria-label="Heroes">
      <div className="hero-shelf__head">
        <p className="hero-shelf__label">Heroes</p>
        <p className="hero-shelf__note">
          {heroes.length
            ? `${heroes.length} owned · equip on Profile`
            : "Unlock heroes in the Shop"}
        </p>
      </div>
      {heroes.length === 0 ? (
        <p className="hero-shelf__empty">No heroes unlocked yet.</p>
      ) : (
        <div className="hero-shelf__row">
          {heroes.map((hero) => {
            const level = heroLevelFromProfile(levels, hero.id);
            return (
              <HeroCardFace
                key={hero.id}
                hero={hero}
                level={level}
                equipped={equipped === hero.id}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

type FaceProps = {
  hero: HeroEntity;
  level: number;
  equipped?: boolean;
  locked?: boolean;
  hideLevel?: boolean;
  size?: "sm" | "md";
  footer?: ReactNode;
};

/** Distinctive hero plate — not a monkey card. */
export function HeroCardFace({
  hero,
  level,
  equipped = false,
  locked = false,
  hideLevel = false,
  size = "sm",
  footer,
}: FaceProps) {
  return (
    <article
      className={`hero-card hero-card--${size}${equipped ? " is-equipped" : ""}${locked ? " is-locked" : ""}`}
    >
      <div className="hero-card__plate" aria-hidden>
        <span className="hero-card__shine" />
        <img
          src={heroPortraitForLevel(hero, level)}
          alt=""
          className="hero-card__art"
        />
        {!hideLevel ? (
          <span className="hero-card__lvl">Lv {level}</span>
        ) : null}
        {equipped ? <span className="hero-card__badge">Equipped</span> : null}
      </div>
      <div className="hero-card__body">
        <strong className="hero-card__name">{hero.name}</strong>
        <span className="hero-card__title">{hero.title}</span>
      </div>
      {footer}
    </article>
  );
}
