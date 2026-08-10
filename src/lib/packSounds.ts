/** Short UI / pack / hero SFX (trimmed BTD6-style clips). */

const SLICE_SRC = "/sounds/pack-slice.wav";
const CARD_FOCUS_SRC = "/sounds/card-focus.wav";
const PACK_RARE_SRC = "/sounds/pack-rare.wav";
const BUY_SRC = "/sounds/buy.wav";
const WHOOSH_SRC = "/sounds/whoosh-2.wav";

const VOLUME_KEY = "bloon.sfxVolume";
const DEFAULT_VOLUME = 0.5;

/** Base hero place/equip lines (first line from playlist comps). */
const HERO_EQUIP_VO = new Set([
  "quincy",
  "gwendolin",
  "obyn-greenfoot",
  "benjamin",
  "ezili",
  "sauda",
  "psi",
]);

const primed = new Map<string, HTMLAudioElement>();
let heroVoPlaying: HTMLAudioElement | null = null;
let masterVolume = loadVolume();
const volumeListeners = new Set<(v: number) => void>();

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, n));
}

function loadVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw == null || raw === "") return DEFAULT_VOLUME;
    return clamp01(Number(raw));
  } catch {
    return DEFAULT_VOLUME;
  }
}

/** Master SFX volume 0–1 (default 50%). */
export function getSfxVolume(): number {
  return masterVolume;
}

/** Persist master SFX volume and notify listeners. */
export function setSfxVolume(next: number): void {
  masterVolume = clamp01(next);
  try {
    window.localStorage.setItem(VOLUME_KEY, String(masterVolume));
  } catch {
    /* ignore */
  }
  for (const fn of volumeListeners) fn(masterVolume);
}

export function subscribeSfxVolume(fn: (v: number) => void): () => void {
  volumeListeners.add(fn);
  return () => {
    volumeListeners.delete(fn);
  };
}

function level(gain = 1): number {
  return masterVolume * clamp01(gain);
}

function ensure(src: string): HTMLAudioElement {
  let el = primed.get(src);
  if (!el) {
    el = new Audio(src);
    el.preload = "auto";
    primed.set(src, el);
  }
  return el;
}

function play(src: string, gain = 1): void {
  if (typeof window === "undefined") return;
  const vol = level(gain);
  if (vol <= 0.001) return;
  try {
    const base = ensure(src);
    const a = base.cloneNode(true) as HTMLAudioElement;
    a.volume = vol;
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
  ensure(CARD_FOCUS_SRC);
  ensure(PACK_RARE_SRC);
  ensure(BUY_SRC);
  ensure(WHOOSH_SRC);
}

export function preloadHeroEquipVo(heroId?: string): void {
  if (typeof window === "undefined") return;
  if (heroId) {
    const id = heroId.toLowerCase();
    if (HERO_EQUIP_VO.has(id)) ensure(`/sounds/heroes/${id}.wav`);
    return;
  }
  for (const id of HERO_EQUIP_VO) {
    ensure(`/sounds/heroes/${id}.wav`);
  }
}

/** Pack-cut / open slash. */
export function playPackSlice(): void {
  play(SLICE_SRC, 1);
}

/** Monkey / hero card opening into fullscreen focus. */
export function playCardFocus(): void {
  play(CARD_FOCUS_SRC, 1);
}

/** T5 / Paragon revealed in a pack pull. */
export function playPackRare(): void {
  play(PACK_RARE_SRC, 1);
}

/** Successful Cash purchase (packs, shop, marketplace, heroes). */
export function playBuy(): void {
  play(BUY_SRC, 1);
}

/** Whoosh when flinging a revealed pack card away. */
export function playCardWhoosh(): void {
  play(WHOOSH_SRC, 1);
}

/** Hero place/equip voice line (first line only). No-op if missing (e.g. Silas). */
export function playHeroEquip(heroId: string): void {
  if (typeof window === "undefined") return;
  const id = heroId.trim().toLowerCase();
  if (!HERO_EQUIP_VO.has(id)) return;
  const src = `/sounds/heroes/${id}.wav`;
  const vol = level(1);
  if (vol <= 0.001) return;
  try {
    if (heroVoPlaying) {
      heroVoPlaying.pause();
      heroVoPlaying = null;
    }
    const base = ensure(src);
    const a = base.cloneNode(true) as HTMLAudioElement;
    a.volume = vol;
    a.currentTime = 0;
    heroVoPlaying = a;
    a.addEventListener("ended", () => {
      if (heroVoPlaying === a) heroVoPlaying = null;
    });
    void a.play().catch(() => {
      /* ignore */
    });
  } catch {
    /* ignore */
  }
}
