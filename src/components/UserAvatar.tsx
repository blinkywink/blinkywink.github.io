import type { AvatarCrop } from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";

type Props = {
  crop: AvatarCrop | null | undefined;
  size?: number;
  className?: string;
  alt?: string;
};

/** Circular PFP from a card portrait + stored crop. Falls back to person icon. */
export function UserAvatar({
  crop,
  size = 36,
  className = "",
  alt = "",
}: Props) {
  const card = crop?.cardId ? cardSpecById(crop.cardId) : null;
  const src = card?.entity.image;

  if (!src || !crop?.cardId) {
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

  const zoom = crop.zoom;
  const x = crop.x;
  const y = crop.y;

  return (
    <span
      className={`user-avatar ${className}`.trim()}
      style={{ width: size, height: size }}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          transform: `translate(-50%, -50%) scale(${zoom})`,
          left: `${x * 100}%`,
          top: `${y * 100}%`,
        }}
      />
    </span>
  );
}
