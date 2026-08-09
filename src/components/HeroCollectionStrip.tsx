import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  heroById,
  heroPortraitForLevel,
  type HeroEntity,
} from "../data/heroes";
import { heroBlurb, heroLevelT } from "../lib/heroEffects";
import { heroAccent, heroVisualTier } from "../lib/heroAccents";
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

/** Owned-hero gallery for Collection — click opens view-only focus. */
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
  const [focused, setFocused] = useState<HeroEntity | null>(null);
  const focusLevel = focused
    ? heroLevelFromProfile(levels, focused.id)
    : 1;

  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setFocused(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [focused]);

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
            onClick={() => setFocused(null)}
          />
          <div className="card-focus__panel shop-hero-focus__panel">
            <button
              type="button"
              className="btn btn--ghost btn--sm card-focus__close"
              onClick={() => setFocused(null)}
            >
              ✕ Close
            </button>
            <HeroCardFace
              hero={focused}
              level={focusLevel}
              equipped={equipped === focused.id}
              size="lg"
              mode="focus"
              hideCaption
            />
            <h2 className="shop-hero-focus__name">{focused.name}</h2>
            <p className="shop-hero-focus__blurb">
              {heroBlurb(focused.id, focusLevel)}
            </p>
            <p className="pack-opener__buy-note">
              Equip / level up on Profile & Shop
            </p>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <section className={`hero-shelf ${className}`.trim()} aria-label="Heroes">
      <div className="hero-shelf__head">
        <p className="hero-shelf__label">Heroes</p>
        <p className="hero-shelf__note">
          {heroes.length
            ? `${heroes.length} owned · tap to view · equip in Shop`
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
                onSelect={() => setFocused(hero)}
              />
            );
          })}
        </div>
      )}
      {focusPortal}
    </section>
  );
}

type FaceProps = {
  hero: HeroEntity;
  level: number;
  equipped?: boolean;
  hideLevel?: boolean;
  hideCaption?: boolean;
  /** preview = shelf (static VFX); focus = fullscreen with live FX */
  mode?: "preview" | "focus";
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
  onSelect?: () => void;
};

/** Hero plate: full-color art; palette + VFX restyle every 5 levels (L20 ultra). */
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
  const tier = heroVisualTier(level);
  const accent = heroAccent(hero.id, level);
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const interactive = mode === "focus";
  /** Animated layers only in fullscreen — keeps shelves cheap. */
  const liveFx = mode === "focus";

  const style = {
    ["--hero-power" as string]: String(power),
    ["--hero-tier" as string]: String(tier),
    ["--hero-primary" as string]: accent.primary,
    ["--hero-secondary" as string]: accent.secondary,
    ["--hero-tertiary" as string]: accent.tertiary,
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
        `hero-card--tier-${tier}`,
        liveFx ? "hero-card--live-fx" : "hero-card--static-fx",
        equipped ? "is-equipped" : "",
        hideCaption ? "hero-card--plate-only" : "",
        active ? "is-tilting" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      data-tier={tier}
    >
      <div className="hero-card__plate">
        <span className="hero-card__glow" aria-hidden />
        <span className="hero-card__shine" aria-hidden />
        <span className="hero-card__holo" aria-hidden />
        {liveFx ? (
          <>
            {tier >= 1 && tier <= 3 ? (
              <span className="hero-card__vfx hero-card__vfx--drift" aria-hidden />
            ) : null}
            {tier >= 2 ? (
              <span className="hero-card__vfx hero-card__vfx--sweep" aria-hidden />
            ) : null}
            {tier >= 2 && tier <= 3 ? (
              <span className="hero-card__vfx hero-card__vfx--orbs" aria-hidden />
            ) : null}
            {tier === 3 ? (
              <>
                <span className="hero-card__vfx hero-card__vfx--veins" aria-hidden />
                <span className="hero-card__vfx hero-card__vfx--spark" aria-hidden />
              </>
            ) : null}
            {tier >= 4 ? (
              <span className="hero-card__vfx hero-card__vfx--ultra" aria-hidden />
            ) : null}
          </>
        ) : null}
        <span className="hero-card__frame" aria-hidden />
        <img
          src={heroPortraitForLevel(hero, level)}
          alt=""
          className="hero-card__art"
          aria-hidden
        />
        <header className="hero-card__head">
          <h2 className="hero-card__name">{hero.name}</h2>
          {!hideLevel ? (
            <p className="hero-card__lvl">Lv {level}</p>
          ) : null}
        </header>
        {equipped ? <span className="hero-card__badge">Equipped</span> : null}
      </div>
      {footer}
    </article>
  );

  if (!interactive && !onSelect) return body;

  return (
    <div
      ref={sceneRef}
      className={[
        "hero-card-scene",
        `hero-card-scene--${mode}`,
        onSelect ? "hero-card-scene--selectable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
