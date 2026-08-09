import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  heroById,
  heroPortraitForLevel,
  type HeroEntity,
} from "../data/heroes";
import { heroLevelT } from "../lib/heroEffects";
import { heroAccent } from "../lib/heroAccents";
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
                mode="preview"
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
  hideLevel?: boolean;
  hideCaption?: boolean;
  /** preview = shelf; focus = modal with tilt + stronger FX */
  mode?: "preview" | "focus";
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
  onSelect?: () => void;
};

/** Hero plate: full-color art; accent backgrounds intensify with level. */
export function HeroCardFace({
  hero,
  level,
  equipped = false,
  hideLevel = false,
  hideCaption = false,
  mode = "preview",
  size = "sm",
  footer,
  onSelect,
}: FaceProps) {
  const power = heroLevelT(level);
  const accent = heroAccent(hero.id);
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const interactive = mode === "focus";

  const style = {
    ["--hero-power" as string]: String(power),
    ["--hero-primary" as string]: accent.primary,
    ["--hero-secondary" as string]: accent.secondary,
    ["--hero-r" as string]: String(accent.rgb[0]),
    ["--hero-g" as string]: String(accent.rgb[1]),
    ["--hero-b" as string]: String(accent.rgb[2]),
    ["--rx" as string]: "0deg",
    ["--ry" as string]: "0deg",
    ["--tx" as string]: "0px",
    ["--ty" as string]: "0px",
    ["--px" as string]: "50%",
    ["--py" as string]: "42%",
  } as CSSProperties;

  const applyPoint = useCallback((clientX: number, clientY: number) => {
    const scene = sceneRef.current;
    const card = cardRef.current;
    if (!scene || !card) return;
    const rect = scene.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const softX = 0.5 + (px - 0.5) * 0.92;
    const softY = 0.5 + (py - 0.5) * 0.92;
    card.style.setProperty("--rx", `${((0.5 - softY) * 16).toFixed(2)}deg`);
    card.style.setProperty("--ry", `${((softX - 0.5) * 22).toFixed(2)}deg`);
    card.style.setProperty("--px", `${(softX * 100).toFixed(1)}%`);
    card.style.setProperty("--py", `${(softY * 100).toFixed(1)}%`);
    card.style.setProperty("--tx", `${((softX - 0.5) * 10).toFixed(2)}px`);
    card.style.setProperty("--ty", `${((softY - 0.5) * 8).toFixed(2)}px`);
  }, []);

  const resetTilt = useCallback(() => {
    setActive(false);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--tx", "0px");
    card.style.setProperty("--ty", "0px");
    card.style.setProperty("--px", "50%");
    card.style.setProperty("--py", "42%");
  }, []);

  function onMove(e: ReactPointerEvent) {
    if (!interactive) return;
    setActive(true);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyPoint(e.clientX, e.clientY);
    });
  }

  const body = (
    <article
      ref={cardRef}
      className={[
        "hero-card",
        `hero-card--${size}`,
        `hero-card--${mode}`,
        equipped ? "is-equipped" : "",
        hideCaption ? "hero-card--plate-only" : "",
        active ? "is-tilting" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <div className="hero-card__plate" aria-hidden>
        <span className="hero-card__glow" />
        <span className="hero-card__shine" />
        <span className="hero-card__holo" />
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
      {!hideCaption ? (
        <div className="hero-card__body">
          <strong className="hero-card__name">{hero.name}</strong>
        </div>
      ) : null}
      {footer}
    </article>
  );

  if (!interactive && !onSelect) return body;

  return (
    <div
      ref={sceneRef}
      className={`hero-card-scene hero-card-scene--${mode}`}
      onPointerMove={interactive ? onMove : undefined}
      onPointerLeave={interactive ? resetTilt : undefined}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      {body}
    </div>
  );
}
