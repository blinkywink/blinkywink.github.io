/** Short UI / pack / hero SFX — Web Audio for low-latency play. */

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

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
let audioCtx: AudioContext | null = null;
let heroVoSource: AudioBufferSourceNode | null = null;
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
  /** Keep the profile slider scale; bake in a quieter default mix. */
  return masterVolume * 0.5 * clamp01(gain);
}

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function decode(src: string): Promise<AudioBuffer | null> {
  const hit = buffers.get(src);
  if (hit) return Promise.resolve(hit);
  const pending = loading.get(src);
  if (pending) return pending;
  const ac = ctx();
  if (!ac) return Promise.resolve(null);
  const job = fetch(src)
    .then((r) => r.arrayBuffer())
    .then((raw) => ac.decodeAudioData(raw.slice(0)))
    .then((buf) => {
      buffers.set(src, buf);
      loading.delete(src);
      return buf;
    })
    .catch(() => {
      loading.delete(src);
      return null;
    });
  loading.set(src, job);
  return job;
}

function playBuffer(
  src: string,
  gain = 1,
  opts?: { replaceHero?: boolean },
): void {
  if (typeof window === "undefined") return;
  const vol = level(gain);
  if (vol <= 0.001) return;
  const ac = ctx();
  if (!ac) return;

  const start = (buf: AudioBuffer) => {
    try {
      if (opts?.replaceHero && heroVoSource) {
        try {
          heroVoSource.stop();
        } catch {
          /* already stopped */
        }
        heroVoSource = null;
      }
      const node = ac.createBufferSource();
      const g = ac.createGain();
      g.gain.value = vol;
      node.buffer = buf;
      node.connect(g);
      g.connect(ac.destination);
      if (opts?.replaceHero) {
        heroVoSource = node;
        node.onended = () => {
          if (heroVoSource === node) heroVoSource = null;
        };
      }
      node.start(0);
    } catch {
      /* ignore */
    }
  };

  const buf = buffers.get(src);
  if (buf) {
    start(buf);
    return;
  }
  // First hit may wait one decode — kick it now; subsequent plays are instant.
  void decode(src).then((decoded) => {
    if (decoded) start(decoded);
  });
}

function warm(src: string): void {
  void decode(src);
}

/** Warm buffers so first play isn't delayed. */
export function preloadPackSounds(): void {
  if (typeof window === "undefined") return;
  ctx();
  warm(SLICE_SRC);
  warm(CARD_FOCUS_SRC);
  warm(PACK_RARE_SRC);
  warm(BUY_SRC);
  warm(WHOOSH_SRC);
}

export function preloadHeroEquipVo(heroId?: string): void {
  if (typeof window === "undefined") return;
  ctx();
  if (heroId) {
    const id = heroId.toLowerCase();
    if (HERO_EQUIP_VO.has(id)) warm(`/sounds/heroes/${id}.wav`);
    return;
  }
  for (const id of HERO_EQUIP_VO) warm(`/sounds/heroes/${id}.wav`);
}

/** Pack-cut / open slash. */
export function playPackSlice(): void {
  playBuffer(SLICE_SRC, 1);
}

/** Monkey / hero / shop-pack opening into focus. */
export function playCardFocus(): void {
  playBuffer(CARD_FOCUS_SRC, 1);
}

/** T5 / Paragon revealed in a pack pull. */
export function playPackRare(): void {
  playBuffer(PACK_RARE_SRC, 1);
}

/** Successful Cash purchase (packs, shop, marketplace, heroes). */
export function playBuy(): void {
  playBuffer(BUY_SRC, 1);
}

/** Whoosh when flinging a revealed pack card away. */
export function playCardWhoosh(): void {
  playBuffer(WHOOSH_SRC, 1);
}

/** Hero place/equip voice line (first line only). No-op if missing (e.g. Silas). */
export function playHeroEquip(heroId: string): void {
  const id = heroId.trim().toLowerCase();
  if (!HERO_EQUIP_VO.has(id)) return;
  playBuffer(`/sounds/heroes/${id}.wav`, 1, { replaceHero: true });
}
