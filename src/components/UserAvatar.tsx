import type { AvatarCrop } from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";
import { MonkeyCard } from "./MonkeyCard";

type Props = {
  crop: AvatarCrop | null | undefined;
  size?: number;
  className?: string;
  alt?: string;
};

/** Circular PFP cropping a real MonkeyCard (not just the tower portrait). */
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

  const previewW = Math.max(Math.round(size * 1.45), 52);
  const previewH = Math.round((previewW * 3.5) / 2.5);
  const previewScale = previewW / 400;
  const lite = size < 100;

  return (
    <span
      className={`user-avatar ${className}`.trim()}
      style={{ width: size, height: size }}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      <span
        className="user-avatar__card"
        style={{
          ["--card-face-w" as string]: "400px",
          ["--card-preview-w" as string]: `${previewW}px`,
          ["--card-preview-scale" as string]: String(previewScale),
          ["--card-preview-h" as string]: `${previewH}px`,
          width: previewW,
          height: previewH,
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          transform: `translate(-50%, -50%) scale(${crop.zoom})`,
        }}
      >
        <MonkeyCard
          entity={card.entity}
          pathLevels={card.pathLevels}
          mode="preview"
          owned
          staticArt={lite}
        />
      </span>
    </span>
  );
}
