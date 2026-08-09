import type { CSSProperties } from "react";
import type { AvatarCrop } from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";

type Props = {
  crop: AvatarCrop | null | undefined;
  size?: number;
  className?: string;
  alt?: string;
};

/**
 * Circular PFP — image fills the circle (object-fit + focal zoom).
 * Same math at any resolution / DPR (no nested card scales).
 */
export function UserAvatar({
  crop,
  size = 36,
  className = "",
  alt = "",
}: Props) {
  const card = crop?.cardId ? cardSpecById(crop.cardId) : null;

  if (!card || !crop?.cardId) {
    return (
      <span
        className={`user-avatar user-avatar--fallback ${className}`.trim()}
        style={{ width: size, height: size }}
        aria-hidden={alt ? undefined : true}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle
            cx="12"
            cy="8"
            r="3.25"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M5.5 19.25a6.5 6.5 0 0 1 13 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  const zoom = Number.isFinite(crop.zoom)
    ? Math.min(4, Math.max(1, crop.zoom))
    : 1.25;
  const x = Number.isFinite(crop.x) ? Math.min(1, Math.max(0, crop.x)) : 0.5;
  const y = Number.isFinite(crop.y) ? Math.min(1, Math.max(0, crop.y)) : 0.38;

  return (
    <span
      className={`user-avatar ${className}`.trim()}
      style={
        {
          width: size,
          height: size,
          ["--ax" as string]: `${x * 100}%`,
          ["--ay" as string]: `${y * 100}%`,
          ["--az" as string]: String(zoom),
        } as CSSProperties
      }
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      <img
        className="user-avatar__media"
        src={card.entity.image}
        alt=""
        draggable={false}
        decoding="async"
      />
    </span>
  );
}
