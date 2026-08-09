import { useMemo } from "react";
import { heroById, heroPortraitForLevel } from "../data/heroes";
import {
  SHOPPABLE_HERO_IDS,
  heroLevelFromProfile,
  normalizeHeroLevels,
  normalizeOwnedHeroIds,
} from "../lib/profileHeroes";

type Props = {
  ownedHeroIds?: string[] | null;
  equippedHeroId?: string | null;
  heroLevels?: Record<string, number> | null;
  className?: string;
};

/** Compact shoppable-hero roster: owned color, unowned grey, equipped ring. */
export function HeroCollectionStrip({
  ownedHeroIds,
  equippedHeroId,
  heroLevels,
  className = "",
}: Props) {
  const owned = useMemo(
    () => new Set(normalizeOwnedHeroIds(ownedHeroIds)),
    [ownedHeroIds],
  );
  const levels = useMemo(
    () => normalizeHeroLevels(heroLevels),
    [heroLevels],
  );
  const equipped = equippedHeroId?.trim().toLowerCase() || null;

  return (
    <div className={`hero-strip ${className}`.trim()} aria-label="Heroes">
      <p className="hero-strip__label">Heroes</p>
      <div className="hero-strip__row">
        {SHOPPABLE_HERO_IDS.map((id) => {
          const hero = heroById(id);
          if (!hero) return null;
          const mine = owned.has(id);
          const level = heroLevelFromProfile(levels, id);
          const isEq = equipped === id;
          return (
            <span
              key={id}
              className={`hero-strip__slot${mine ? " is-owned" : " is-locked"}${isEq ? " is-equipped" : ""}`}
              title={
                isEq
                  ? `${hero.name} · Equipped`
                  : mine
                    ? hero.name
                    : `${hero.name} · Locked`
              }
            >
              <img
                src={heroPortraitForLevel(hero, mine ? level : 1)}
                alt={hero.name}
              />
              {isEq ? <span className="hero-strip__eq">E</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
