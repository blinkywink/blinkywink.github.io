/** Short UI / pack SFX (trimmed BTD6-style clips). */

const SLICE_SRC = "/sounds/pack-slice.wav";
const CARD_FOCUS_SRC = "/sounds/card-focus.wav";
const PACK_T4_SRC = "/sounds/pack-t4.wav";
const PACK_RARE_SRC = "/sounds/pack-rare.wav";
const BUY_SRC = "/sounds/buy.wav";

const primed = new Map<string, HTMLAudioElement>();

function ensure(src: string, volume = 0.9): HTMLAudioElement {
  let el = primed.get(src);
  if (!el) {
    el = new Audio(src);
    el.preload = "auto";
    el.volume = volume;
    primed.set(src, el);
  }
  return el;
}

function play(src: string, volume = 0.9): void {
  if (typeof window === "undefined") return;
  try {
    const base = ensure(src, volume);
    const a = base.cloneNode(true) as HTMLAudioElement;
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => {
      /* autoplay / gesture policy */
    });
  } catch {
    /* ignore */
  }
}

/** Warm buffers so first play isn't delayed. */
export function preloadPackSounds(): void {
  if (typeof window === "undefined") return;
  ensure(SLICE_SRC);
  ensure(CARD_FOCUS_SRC, 0.85);
  ensure(PACK_T4_SRC, 0.95);
  ensure(PACK_RARE_SRC, 0.95);
  ensure(BUY_SRC, 0.9);
}

/** Pack-cut slash. */
export function playPackSlice(): void {
  play(SLICE_SRC, 0.9);
}

/** Monkey / hero card opening into fullscreen focus. */
export function playCardFocus(): void {
  play(CARD_FOCUS_SRC, 0.85);
}

/** Tier-4 card revealed in a pack pull. */
export function playPackT4(): void {
  play(PACK_T4_SRC, 0.95);
}

/** T5 / Paragon revealed in a pack pull. */
export function playPackRare(): void {
  play(PACK_RARE_SRC, 0.95);
}

/** Successful Cash purchase (packs, shop, marketplace, heroes). */
export function playBuy(): void {
  play(BUY_SRC, 0.9);
}
