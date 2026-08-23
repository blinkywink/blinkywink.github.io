/** Helium Pop SFX — reuses shared arcade buffers. */

import {
  playBloonPop,
  playCardWhoosh,
  playPackSlice,
  preloadPackSounds,
} from "../../lib/packSounds";

let warmed = false;

export function warmRicoSfx(): void {
  if (warmed) return;
  warmed = true;
  preloadPackSounds();
}

export function playRicoFire(): void {
  playCardWhoosh();
}

export function playRicoPop(intensity = 1): void {
  playBloonPop(0.55 + 0.45 * Math.min(1, intensity));
}

/** Louder crack when a wall finally shatters. */
export function playRicoShatter(): void {
  playPackSlice();
  playBloonPop(0.3);
}
