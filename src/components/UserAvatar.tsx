import { useEffect, useState, type CSSProperties } from "react";
import type { AvatarCrop } from "../lib/avatar";
import {
  getCardFaceImageUrl,
  peekCardFaceImageUrl,
  type CardFaceBakeOpts,
} from "../lib/cardFaceImage";
import { cardSpecById } from "../lib/cardCatalog";

type Props = {
  crop: AvatarCrop | null | undefined;
  size?: number;
  className?: string;
  alt?: string;
  /** Degree / art seed for the card copy (paragon FX, visualizer). */
  face?: CardFaceBakeOpts | null;
};

/**
 * Circular PFP — full card baked to one bitmap, then cropped like a photo.
 * Every size shares the same image so previews stay accurate.
 */
export function UserAvatar({
  crop,
  size = 36,
  className = "",
  alt = "",
  face,
}: Props) {
  const cardId = crop?.cardId ?? null;
  const card = cardId ? cardSpecById(cardId) : null;
  const degree = face?.degree;
  const visualSeed = face?.visualSeed;
  const bakeOpts: CardFaceBakeOpts | undefined =
    degree != null || visualSeed != null
      ? { degree, visualSeed }
      : undefined;

  const [src, setSrc] = useState<string | null>(() =>
    cardId ? peekCardFaceImageUrl(cardId, bakeOpts) : null,
  );

  useEffect(() => {
    if (!cardId || !card) {
      setSrc(null);
      return;
    }
    const opts: CardFaceBakeOpts | undefined =
      degree != null || visualSeed != null
        ? { degree, visualSeed }
        : undefined;
    const peeked = peekCardFaceImageUrl(cardId, opts);
    if (peeked) {
      setSrc(peeked);
      return;
    }
    let cancelled = false;
    // Keep prior src / tower art visible — do not flash blank while baking.
    void getCardFaceImageUrl(cardId, opts)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        /* leave tower-art fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [cardId, card, degree, visualSeed]);

  if (!card || !cardId) {
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

  const zoom = Number.isFinite(crop?.zoom)
    ? Math.min(4, Math.max(1, crop!.zoom))
    : 1.25;
  const x = Number.isFinite(crop?.x) ? Math.min(1, Math.max(0, crop!.x)) : 0.5;
  const y = Number.isFinite(crop?.y) ? Math.min(1, Math.max(0, crop!.y)) : 0.38;
  const mediaSrc = src ?? card.entity.image ?? null;

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
      {mediaSrc ? (
        <img
          className={`user-avatar__media${src ? "" : " user-avatar__media--pending"}`}
          src={mediaSrc}
          alt=""
          draggable={false}
          decoding="async"
        />
      ) : null}
    </span>
  );
}
