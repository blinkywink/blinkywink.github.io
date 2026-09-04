/** Shared avatar crop data (card portrait + focal zoom). */

export type AvatarCrop = {
  cardId: string | null;
  zoom: number;
  x: number;
  y: number;
  /** Owner's T4+ copy seed. Leaderboard / other players need this. */
  visualSeed?: number | null;
  /** Paragon degree for the PFP copy. */
  degree?: number | null;
};

export const DEFAULT_AVATAR_CROP: AvatarCrop = {
  cardId: null,
  zoom: 1.25,
  x: 0.5,
  y: 0.38,
};

export function clampAvatarZoom(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_AVATAR_CROP.zoom;
  return Math.min(4, Math.max(1, n));
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function normalizeAvatarCrop(input: {
  cardId?: string | null;
  zoom?: number | null;
  x?: number | null;
  y?: number | null;
  visualSeed?: number | null;
  degree?: number | null;
}): AvatarCrop {
  const cardId = input.cardId ? String(input.cardId) : null;
  const seed = Number(input.visualSeed);
  const degree = Number(input.degree);
  return {
    cardId: cardId && cardId.length >= 3 ? cardId : null,
    zoom: clampAvatarZoom(Number(input.zoom ?? DEFAULT_AVATAR_CROP.zoom)),
    x: clamp01(Number(input.x ?? DEFAULT_AVATAR_CROP.x)),
    y: clamp01(Number(input.y ?? DEFAULT_AVATAR_CROP.y)),
    visualSeed: Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : null,
    degree: Number.isFinite(degree) && degree > 0 ? Math.floor(degree) : null,
  };
}
