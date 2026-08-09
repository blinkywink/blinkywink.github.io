/** Shared avatar crop data (card portrait + focal zoom). */

export type AvatarCrop = {
  cardId: string | null;
  zoom: number;
  x: number;
  y: number;
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
}): AvatarCrop {
  const cardId = input.cardId ? String(input.cardId) : null;
  return {
    cardId: cardId && cardId.length >= 3 ? cardId : null,
    zoom: clampAvatarZoom(Number(input.zoom ?? DEFAULT_AVATAR_CROP.zoom)),
    x: clamp01(Number(input.x ?? DEFAULT_AVATAR_CROP.x)),
    y: clamp01(Number(input.y ?? DEFAULT_AVATAR_CROP.y)),
  };
}
