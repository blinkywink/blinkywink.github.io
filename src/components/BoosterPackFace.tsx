import type { CSSProperties } from "react";
import {
  type PackDef,
  resolveCategoryPackTheme,
  resolveTowerPackTheme,
} from "../lib/packTheme";

type Props = {
  pack: PackDef;
  className?: string;
  /** Shelf scroll: defer decoding category mosaic tiles. */
  lazyImages?: boolean;
};

/** Printed face only - sits inside `.booster__face`. */
export function BoosterPackFace({ pack, className = "", lazyImages = false }: Props) {
  const imgLoad = lazyImages ? "lazy" : "eager";
  if (pack.kind === "btd6") {
    return (
      <div className={`pack-face pack-face--btd6 ${className}`.trim()}>
        <div className="booster__art">
          <img src={pack.coverArt} alt="" draggable={false} decoding="async" loading={imgLoad} />
        </div>
      </div>
    );
  }

  if (pack.kind === "category" && pack.category) {
    const theme = resolveCategoryPackTheme(pack.category);
    const style = {
      ["--pack-p" as string]: theme.primary,
      ["--pack-s" as string]: theme.secondary,
      ["--pack-ink" as string]: theme.ink,
    } as CSSProperties;

    return (
      <div
        className={`pack-face pack-face--category ${className}`.trim()}
        style={style}
      >
        <div className="pack-face__wash" aria-hidden />
        <div className="pack-face__grid" aria-hidden />
        <div className="pack-face__category-mosaic" aria-hidden>
          {theme.images.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className={`pack-face__category-slot pack-face__category-slot--${i}`}
            >
              <img src={src} alt="" draggable={false} decoding="async" loading={imgLoad} />
            </div>
          ))}
        </div>
        <div className="pack-face__copy">
          <span className={`pack-face__name ${packNameClass(theme.title)}`}>
            {theme.title}
          </span>
        </div>
        <div className="pack-face__shine" aria-hidden />
      </div>
    );
  }

  const theme = pack.tower ? resolveTowerPackTheme(pack.tower) : null;
  if (!theme) {
    return <div className={`pack-face pack-face--empty ${className}`.trim()} />;
  }

  const style = {
    ["--pack-p" as string]: theme.primary,
    ["--pack-s" as string]: theme.secondary,
    ["--pack-t" as string]: theme.tertiary,
    ["--pack-ink" as string]: theme.categoryInk,
    ["--pack-r" as string]: String(theme.rgb[0]),
    ["--pack-g" as string]: String(theme.rgb[1]),
    ["--pack-b" as string]: String(theme.rgb[2]),
  } as CSSProperties;

  return (
    <div
      className={`pack-face pack-face--tower ${className}`.trim()}
      style={style}
    >
      <div className="pack-face__wash" aria-hidden />
      <div className="pack-face__grid" aria-hidden />

      <div className="pack-face__hero">
        <img src={theme.image} alt="" draggable={false} decoding="async" loading={imgLoad} />
      </div>

      <div className="pack-face__copy">
        <span className={`pack-face__name ${packNameClass(theme.title)}`}>
          {theme.title}
        </span>
      </div>

      <div className="pack-face__shine" aria-hidden />
    </div>
  );
}

/** Length class - font-size is in cqi so shelf + opener stay proportional. */
function packNameClass(title: string): string {
  const n = title.replace(/\s+/g, "").length;
  if (n >= 12) return "is-xl";
  if (n >= 10) return "is-lg";
  if (n >= 8) return "is-md";
  return "is-sm";
}
