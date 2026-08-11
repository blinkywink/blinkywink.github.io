import { useCallback, useMemo, useRef, useState } from "react";
import { useCardCollectionOptional } from "../auth/CardCollectionProvider";
import cardAccents from "../data/cardAccents.json";
import type { TowerEntity } from "../data/types";
import {
  formatPathLevels,
  investedPathTiers,
  paragonCardId,
  pathLevelsFromEntity,
  towerIdSlug,
  upgradeEntityId,
  type PathLevels,
} from "../lib/pathCombos";
import {
  clampParagonDegree,
  PARAGON_MIN_DEGREE,
  paragonStage,
} from "../lib/paragonProgress";
import { CardVisualizerBg } from "./CardVisualizerBg";

type Accent = {
  primary: string;
  secondary: string;
  colors?: string[];
  rgb: [number, number, number];
  icon: string | null;
};

type Props = {
  entity: TowerEntity;
  /** Full BTD6 crosspath; defaults from the single upgrade/base entity. */
  pathLevels?: PathLevels;
  /** Grid thumbnails stay static; focus gets full tilt/holo. */
  mode?: "preview" | "focus";
  /** False = greyed-out locked placeholder in the collection. */
  owned?: boolean;
  /** Soft highlight after unlocking from a pack. */
  highlight?: boolean;
  onSelect?: () => void;
  /** Skip canvas visualizer (tiny avatars / dense lists). */
  staticArt?: boolean;
  /** Paragon degree 1–100. Falls back to the signed-in collection. */
  degree?: number;
};

const accents = cardAccents as unknown as Record<string, Accent>;

/** Shared look from wiki Paragon icon — electric blue + neon violet. */
const PARAGON_ACCENT = {
  primary: "#0f7dfe",
  secondary: "#b401fe",
  rgb: [15, 125, 254] as [number, number, number],
  colors: [
    "#0f7dfe",
    "#b401fe",
    "#7d01fe",
    "#3400fe",
    "#10388f",
    "#0f205c",
    "#5ef0ff",
    "#e9d5ff",
  ],
  icon: "/images/ui/paragon-icon.webp",
};

const PARAGON_DEGREE_ICON = "/images/ui/paragon-degree.webp";

/** Effective upgrade ladder: 0 base → 5 T5 → 6 paragon. */
function effectTier(entity: TowerEntity, levels: PathLevels): number {
  if (entity.type === "paragon") return 6;
  return Math.max(levels[0], levels[1], levels[2]);
}

function usesVisualizer(tier: number): boolean {
  return tier >= 5;
}

function usesHoloFx(tier: number): boolean {
  return tier >= 3;
}

function accentStrength(tier: number): number {
  if (tier <= 0) return 0;
  if (tier === 1) return 0.06;
  if (tier === 2) return 0.16;
  if (tier === 3) return 0.42;
  if (tier === 4) return 0.72;
  if (tier === 5) return 0.92;
  return 1;
}

/** Path slots: 0 → thin line; otherwise a row of 5 circles filled up to that tier.
 *  Paragon is tier 6 — one row of 6 filled circles (not a 5-5-5 path grid). */
function PathPipGrid({
  levels,
  isParagon,
}: {
  levels: PathLevels;
  isParagon: boolean;
}) {
  const label = isParagon ? "Paragon" : formatPathLevels(levels);

  if (isParagon) {
    return (
      <div
        className="monkey-card__path-grid monkey-card__path-grid--paragon"
        aria-label="Upgrade paths Paragon"
      >
        <div className="monkey-card__path-row monkey-card__path-row--paragon">
          {[1, 2, 3, 4, 5, 6].map((tier) => (
            <span
              key={tier}
              className="monkey-card__tier-pip is-filled is-paragon"
              aria-hidden
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="monkey-card__path-grid" aria-label={`Upgrade paths ${label}`}>
      {levels.map((filled, pathIdx) =>
        filled <= 0 ? (
          <div
            key={pathIdx}
            className="monkey-card__path-row monkey-card__path-row--empty"
            aria-hidden
          >
            <span className="monkey-card__path-line" />
          </div>
        ) : (
          <div key={pathIdx} className="monkey-card__path-row">
            {[1, 2, 3, 4, 5].map((tier) => (
              <span
                key={tier}
                className={`monkey-card__tier-pip${tier <= filled ? " is-filled" : ""}`}
                aria-hidden
              />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function darkenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return "#152232";
  const f = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

type ParagonFxPt = { x: string; y: string };

const PARAGON_SMOKE: ParagonFxPt[] = [
  { x: "-8%", y: "14%" },
  { x: "86%", y: "10%" },
  { x: "-6%", y: "58%" },
  { x: "88%", y: "64%" },
  { x: "18%", y: "-7%" },
  { x: "62%", y: "96%" },
  { x: "-4%", y: "34%" },
  { x: "90%", y: "38%" },
];

const PARAGON_STARS: ParagonFxPt[] = [
  { x: "-5%", y: "16%" },
  { x: "96%", y: "10%" },
  { x: "8%", y: "-5%" },
  { x: "92%", y: "78%" },
  { x: "22%", y: "98%" },
];

function paragonFxStyle(pt: ParagonFxPt, i: number): React.CSSProperties {
  return { left: pt.x, top: pt.y, ["--i" as string]: i };
}

function ParagonRings({ stage }: { stage: number }) {
  return (
    <div
      className={`monkey-card__paragon-rings monkey-card__paragon-rings--s${stage}`}
      aria-hidden
    >
      <div className="monkey-card__paragon-rings-space">
        <span className="monkey-card__paragon-ring-pivot monkey-card__paragon-ring-pivot--a">
          <span className="monkey-card__paragon-ring" />
        </span>
        {stage >= 2 ? (
          <span className="monkey-card__paragon-ring-pivot monkey-card__paragon-ring-pivot--b">
            <span className="monkey-card__paragon-ring" />
          </span>
        ) : null}
        {stage >= 4 ? (
          <span className="monkey-card__paragon-ring-pivot monkey-card__paragon-ring-pivot--c">
            <span className="monkey-card__paragon-ring" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Full-art collectible card from real tower/upgrade data. */
export function MonkeyCard({
  entity,
  pathLevels: pathLevelsProp,
  mode = "focus",
  owned = true,
  highlight = false,
  onSelect,
  staticArt = false,
  degree: degreeProp,
}: Props) {
  const isPreview = mode === "preview";
  const locked = !owned;
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const tapGesture = useRef<{
    x: number;
    y: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const [active, setActive] = useState(false);

  const isParagon = entity.type === "paragon";
  const collection = useCardCollectionOptional();
  const ownedDegree = isParagon
    ? collection?.paragonOf(paragonCardId(entity.tower))?.degree
    : undefined;
  const paragonDegree = isParagon
    ? clampParagonDegree(
        degreeProp ?? (!locked ? ownedDegree : undefined) ?? PARAGON_MIN_DEGREE,
      )
    : PARAGON_MIN_DEGREE;
  const stage = isParagon ? paragonStage(paragonDegree) : 0;
  const pathLevels = pathLevelsProp ?? pathLevelsFromEntity(entity);
  const accent = accents[entity.id];
  const tier = effectTier(entity, pathLevels);
  const strength = accentStrength(tier);
  const visualizer = usesVisualizer(tier) && !staticArt;
  const holo = usesHoloFx(tier) && !isPreview;

  const pathIcons = useMemo(() => {
    const iconFor = (id: string) =>
      accents[id]?.icon ?? `/images/upgrade-icons/${id}.webp`;

    if (isParagon) {
      return [
        { key: "upgrade", src: iconFor(entity.id) },
        { key: "paragon", src: PARAGON_ACCENT.icon },
      ];
    }

    const slug = towerIdSlug(entity.tower);
    return investedPathTiers(pathLevels).map(({ path, tier: t }) => {
      const id = upgradeEntityId(slug, path, t);
      return { key: id, src: iconFor(id) };
    });
  }, [entity.id, entity.tower, isParagon, pathLevels]);

  const palette = useMemo(() => {
    if (isParagon) return PARAGON_ACCENT.colors;
    if (accent?.colors?.length) return accent.colors;
    return [
      accent?.primary ?? "#2f9fe0",
      accent?.secondary ?? "#c8c8d4",
      "#7cf0c0",
      "#ff6b9d",
    ];
  }, [accent, isParagon]);

  const primary = isParagon
    ? PARAGON_ACCENT.primary
    : (accent?.primary ?? "#2f9fe0");
  const secondary = isParagon
    ? PARAGON_ACCENT.secondary
    : (accent?.secondary ?? "#c8c8d4");

  const colorFieldStyle = useMemo(() => {
    if (tier <= 0) {
      return { background: "#14181f" } as React.CSSProperties;
    }
    if (tier === 1) {
      return { background: "#161b24" } as React.CSSProperties;
    }
    if (tier === 2) {
      return {
        background: `linear-gradient(165deg, #181e28 0%, #12161e 100%)`,
      } as React.CSSProperties;
    }
    if (tier === 3) {
      return {
        background: `
          radial-gradient(circle at 40% 28%, color-mix(in srgb, ${primary} 28%, transparent), transparent 54%),
          radial-gradient(circle at 75% 70%, color-mix(in srgb, ${secondary} 14%, transparent), transparent 50%),
          linear-gradient(165deg, #1a2030 0%, #11151c 80%)
        `,
      } as React.CSSProperties;
    }
    return {
      background: `
        radial-gradient(circle at 35% 28%, color-mix(in srgb, ${primary} 52%, transparent), transparent 52%),
        radial-gradient(circle at 78% 72%, color-mix(in srgb, ${secondary} 36%, transparent), transparent 48%),
        linear-gradient(155deg, ${darkenHex(primary, 0.68)} 0%, #10141c 50%, ${darkenHex(secondary, 0.78)} 100%)
      `,
    } as React.CSSProperties;
  }, [tier, primary, secondary]);

  const accentStyle = useMemo(() => {
    const [r, g, b] = isParagon
      ? PARAGON_ACCENT.rgb
      : (accent?.rgb ?? [47, 159, 224]);
    return {
      ["--accent" as string]: primary,
      ["--accent-2" as string]: secondary,
      ["--accent-3" as string]: palette[2] ?? secondary,
      ["--accent-4" as string]: palette[3] ?? primary,
      ["--accent-r" as string]: String(r),
      ["--accent-g" as string]: String(g),
      ["--accent-b" as string]: String(b),
      ["--accent-strength" as string]: String(strength),
      ["--holo-mul" as string]: holo
        ? String(
            Math.min(
              1,
              (tier - 2) / 4 + (isParagon ? stage * 0.08 : 0),
            ),
          )
        : "0",
    } as React.CSSProperties;
  }, [accent, strength, palette, isParagon, primary, secondary, holo, tier, stage]);

  const applyPoint = useCallback((clientX: number, clientY: number) => {
    const scene = sceneRef.current;
    const card = cardRef.current;
    if (!scene || !card) return;

    const rect = scene.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const px = clamp01((clientX - rect.left) / rect.width);
    const py = clamp01((clientY - rect.top) / rect.height);
    const softX = 0.5 + (px - 0.5) * 0.92;
    const softY = 0.5 + (py - 0.5) * 0.92;

    card.style.setProperty("--rx", `${((0.5 - softY) * 18).toFixed(2)}deg`);
    card.style.setProperty("--ry", `${((softX - 0.5) * 24).toFixed(2)}deg`);
    card.style.setProperty("--px", `${(softX * 100).toFixed(1)}%`);
    card.style.setProperty("--py", `${(softY * 100).toFixed(1)}%`);
    card.style.setProperty("--tx", `${((softX - 0.5) * 12).toFixed(2)}px`);
    card.style.setProperty("--ty", `${((softY - 0.5) * 9).toFixed(2)}px`);
    card.style.setProperty("--opacity", "0.85");
  }, []);

  const queuePoint = useCallback(
    (clientX: number, clientY: number) => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyPoint(clientX, clientY);
      });
    },
    [applyPoint],
  );

  const reset = useCallback(() => {
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
    card.style.setProperty("--opacity", "0.52");
  }, []);

  const endTapGesture = useCallback(() => {
    const g = tapGesture.current;
    tapGesture.current = null;
    return g;
  }, []);

  const interactiveProps = isPreview
    ? {
        role: "button" as const,
        tabIndex: locked ? -1 : 0,
        "aria-disabled": locked || undefined,
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          if (locked) return;
          if (e.pointerType === "mouse" && e.button !== 0) return;
          tapGesture.current = {
            x: e.clientX,
            y: e.clientY,
            moved: false,
            pointerId: e.pointerId,
          };
          const markMoved = () => {
            if (tapGesture.current) tapGesture.current.moved = true;
          };
          const cleanup = () => {
            window.removeEventListener("scroll", markMoved, true);
            window.removeEventListener("pointerup", cleanup, true);
            window.removeEventListener("pointercancel", cleanup, true);
          };
          // Parent list scroll often won't send move events to the card.
          window.addEventListener("scroll", markMoved, {
            capture: true,
            passive: true,
          });
          window.addEventListener("pointerup", cleanup, true);
          window.addEventListener("pointercancel", cleanup, true);
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          const g = tapGesture.current;
          if (!g || g.moved || g.pointerId !== e.pointerId) return;
          const dx = e.clientX - g.x;
          const dy = e.clientY - g.y;
          if (dx * dx + dy * dy > 100) g.moved = true;
        },
        onPointerCancel: () => {
          endTapGesture();
        },
        onClick: () => {
          if (locked) return;
          const g = endTapGesture();
          // Ignore click after a finger/mouse drag (scroll / swipe).
          if (g?.moved) return;
          onSelect?.();
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (locked) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.();
          }
        },
      }
    : locked
      ? {}
      : {
          onPointerEnter: (e: React.PointerEvent<HTMLDivElement>) => {
            setActive(true);
            queuePoint(e.clientX, e.clientY);
          },
          onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
            queuePoint(e.clientX, e.clientY);
          },
          onPointerLeave: reset,
          onPointerCancel: reset,
          ...(onSelect
            ? {
                role: "button" as const,
                tabIndex: 0,
                onClick: () => onSelect(),
                onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect();
                  }
                },
              }
            : {}),
        };

  const tierClass = isParagon
    ? `monkey-card--paragon monkey-card--paragon-s${stage}`
    : `monkey-card--t${tier}`;
  const pathLabel = isParagon ? "Paragon" : formatPathLevels(pathLevels);

  return (
    <div
      ref={sceneRef}
      className={[
        "monkey-card-scene",
        isPreview ? "monkey-card-scene--preview" : "",
        locked ? "monkey-card-scene--locked" : "",
        highlight ? "monkey-card-scene--new" : "",
        isParagon && !isPreview && stage > 0
          ? `monkey-card-scene--paragon-fx monkey-card-scene--paragon-s${stage}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...interactiveProps}
    >
      {isParagon && !isPreview && stage > 0 ? (
        <div
          className={`monkey-card__paragon-field monkey-card__paragon-field--s${stage}`}
          aria-hidden
        >
          {PARAGON_SMOKE.slice(
            0,
            stage >= 5 ? 8 : stage >= 4 ? 6 : stage >= 2 ? 4 : 3,
          ).map((p, i) => (
            <i
              key={`sm${i}`}
              className="monkey-card__paragon-smoke"
              style={paragonFxStyle(p, i)}
            />
          ))}
        </div>
      ) : null}
      {isParagon && !isPreview && stage > 0 ? (
        <ParagonRings stage={stage} />
      ) : null}
      <div
        ref={cardRef}
        style={accentStyle}
        className={`monkey-card monkey-card--fullart ${isPreview ? "monkey-card--preview" : ""} ${tierClass} ${visualizer ? "monkey-card--visualizer" : "monkey-card--flat-bg"} ${active ? "is-active" : ""} ${locked ? "monkey-card--locked" : ""}`}
      >
        {!isPreview ? (
          <>
            <div className="monkey-card__glow" aria-hidden="true" />
            <div className="monkey-card__shadow" aria-hidden="true" />
          </>
        ) : null}

        <div className="monkey-card__body">
          <div className="monkey-card__bleed">
            {visualizer ? (
              <CardVisualizerBg
                seed={`${entity.id}-${pathLabel}`}
                colors={palette}
                animated={!isPreview}
                intensity={isParagon ? "paragon" : "standard"}
              />
            ) : (
              <>
                <div
                  className="monkey-card__color-field"
                  style={colorFieldStyle}
                  aria-hidden="true"
                />
                {tier >= 2 ? (
                  <div className="monkey-card__accent-wash" aria-hidden="true" />
                ) : null}
              </>
            )}
            {holo ? (
              <>
                <div className="monkey-card__foil" aria-hidden="true" />
                <div className="monkey-card__glare" aria-hidden="true" />
                <div className="monkey-card__spark" aria-hidden="true" />
                <div
                  className="monkey-card__sheen monkey-card__sheen--bleed"
                  aria-hidden="true"
                />
              </>
            ) : null}
            <img
              className="monkey-card__portrait"
              src={entity.image}
              alt=""
              draggable={false}
              loading={isPreview && !staticArt ? "lazy" : "eager"}
              decoding="async"
            />
            {tier >= 2 ? (
              <div className="monkey-card__accent-frame" aria-hidden="true" />
            ) : null}

            <header className="monkey-card__head monkey-card__head--overlay">
              <div className="monkey-card__titles">
                <h2 className="monkey-card__name">{entity.name}</h2>
                <p className="monkey-card__tower">
                  {pathLabel} · {entity.tower}
                </p>
              </div>
            </header>

            <footer className="monkey-card__rail">
              <PathPipGrid levels={pathLevels} isParagon={isParagon} />
              <div className="monkey-card__rail-icons">
                {pathIcons.length > 0 ? (
                  pathIcons.map((icon) => (
                    <img
                      key={icon.key}
                      className="monkey-card__upgrade-icon"
                      src={icon.src}
                      alt=""
                      draggable={false}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ))
                ) : (
                  <span
                    className="monkey-card__upgrade-icon monkey-card__upgrade-icon--empty"
                    aria-hidden="true"
                  />
                )}
              </div>
            </footer>
          </div>
        </div>

        {isParagon && stage > 0 ? (
          <div
            className={`monkey-card__paragon-aura monkey-card__paragon-aura--s${stage}`}
            aria-hidden
          />
        ) : null}

        {isParagon ? (
          <div className="monkey-card__paragon-corner">
            <svg
              className="monkey-card__paragon-ribbon"
              viewBox="0 0 56 176"
              aria-hidden
              preserveAspectRatio="none"
            >
              <path fill="#d200d3" d="M0 0h56v176L28 152 0 176V0z" />
              <path
                fill="none"
                stroke="#3a0277"
                strokeWidth="4"
                strokeLinejoin="miter"
                strokeLinecap="butt"
                d="M2 0v174l26-24 26 24V0"
              />
            </svg>
            <div className="monkey-card__paragon-badge">
              <img
                className="monkey-card__paragon-mark"
                src={PARAGON_DEGREE_ICON}
                alt=""
                draggable={false}
              />
              <span className="monkey-card__paragon-degree">
                {paragonDegree}
                {holo ? (
                  <span className="monkey-card__paragon-degree-sheen" aria-hidden>
                    {paragonDegree}
                  </span>
                ) : null}
              </span>
              {holo ? (
                <div className="monkey-card__paragon-shine" aria-hidden="true">
                  <div className="monkey-card__paragon-shine-sweep" />
                  <div className="monkey-card__paragon-shine-glint" />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="monkey-card__edge" aria-hidden="true" />
      </div>
      {isParagon && !isPreview && stage > 0 ? (
        <div
          className={`monkey-card__paragon-sparks monkey-card__paragon-sparks--s${stage}`}
          aria-hidden
        >
          {PARAGON_STARS.slice(
            0,
            stage >= 5 ? 5 : stage >= 4 ? 4 : stage >= 2 ? 3 : 2,
          ).map((p, i) => (
            <svg
              key={`st${i}`}
              className="monkey-card__paragon-star"
              viewBox="0 0 32 32"
              style={paragonFxStyle(p, i)}
            >
              <path
                fill="currentColor"
                d="M16 0C16.7 9.6 22.4 15.3 32 16 22.4 16.7 16.7 22.4 16 32 15.3 22.4 9.6 16.7 0 16 9.6 15.3 15.3 9.6 16 0Z"
              />
            </svg>
          ))}
        </div>
      ) : null}
    </div>
  );
}
