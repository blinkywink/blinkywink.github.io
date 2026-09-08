/** Bloon Hero player settings (persisted). */

export type HeroKeybinds = [string, string, string, string, string];

export type HeroSettings = {
  /** 0.7-1.8 - higher = notes travel faster (shorter approach). */
  trackSpeed: number;
  /** 0.6-1.8 - note / receptor size multiplier. */
  bloonScale: number;
  /** 0-1 - bloon pop hit SFX volume. */
  popVolume: number;
  /** Show synced chart lyrics during play. */
  lyricsEnabled: boolean;
  /** 0.4-2.8 - synced lyric subtitle size. */
  lyricsScale: number;
  /** Vertical offset in px (−60-200) added to lyric position. */
  lyricsOffsetY: number;
  /** Keys for lanes 0-4. Lowercase. */
  keys: HeroKeybinds;
  /** Fold the 5th expert lane into the 4th so you only play 4 keys. */
  fourNote: boolean;
};

const KEY = "bloonhero-settings-v1";
export const DEFAULT_KEYS: HeroKeybinds = ["d", "f", "j", "k", "l"];
export const DEFAULT_SETTINGS: HeroSettings = {
  trackSpeed: 1,
  bloonScale: 1,
  popVolume: 1,
  lyricsEnabled: true,
  lyricsScale: 1,
  lyricsOffsetY: 0,
  keys: [...DEFAULT_KEYS] as HeroKeybinds,
  fourNote: true,
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function readHeroSettings(): HeroSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS, keys: [...DEFAULT_KEYS] as HeroKeybinds };
    }
    const parsed = JSON.parse(raw) as Partial<HeroSettings>;
    const keys = Array.isArray(parsed.keys)
      ? (parsed.keys.map((k, i) =>
          typeof k === "string" && k.length ? k.toLowerCase() : DEFAULT_KEYS[i],
        ) as HeroKeybinds)
      : ([...DEFAULT_KEYS] as HeroKeybinds);
    const trackSpeed = Number(parsed.trackSpeed);
    const bloonScale = Number(parsed.bloonScale);
    const popVolume = Number(parsed.popVolume);
    const lyricsScale = Number(parsed.lyricsScale);
    const lyricsOffsetY = Number(parsed.lyricsOffsetY);
    return {
      trackSpeed: Number.isFinite(trackSpeed)
        ? clamp(trackSpeed, 0.6, 2)
        : 1,
      bloonScale: Number.isFinite(bloonScale)
        ? clamp(bloonScale, 0.6, 1.8)
        : 1,
      popVolume: Number.isFinite(popVolume) ? clamp(popVolume, 0, 1) : 1,
      lyricsEnabled:
        parsed.lyricsEnabled === undefined ? true : Boolean(parsed.lyricsEnabled),
      lyricsScale: Number.isFinite(lyricsScale)
        ? clamp(lyricsScale, 0.4, 2.8)
        : 1,
      lyricsOffsetY: Number.isFinite(lyricsOffsetY)
        ? clamp(lyricsOffsetY, -60, 200)
        : 0,
      keys,
      fourNote: parsed.fourNote === undefined ? true : Boolean(parsed.fourNote),
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      keys: [...DEFAULT_KEYS] as HeroKeybinds,
    };
  }
}

export function writeHeroSettings(next: HeroSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function keyToLaneMap(
  keys: HeroKeybinds,
  fourNote = false,
): Record<string, number> {
  const out: Record<string, number> = {};
  const used = fourNote ? keys.slice(0, 4) : keys;
  used.forEach((k, i) => {
    if (!k) return;
    out[k.toLowerCase()] = i;
  });
  return out;
}

/** Expert charts are 5-fret. Fold orange into blue and merge same-time doubles. */
export function foldNotesToFour<T extends { t: number; lane: number; dur: number; sustain?: boolean }>(
  notes: T[],
): T[] {
  const out: T[] = [];
  for (const note of notes) {
    const lane = note.lane >= 4 ? 3 : note.lane;
    const next = { ...note, lane };
    const prev = out[out.length - 1];
    if (prev && prev.lane === lane && Math.abs(prev.t - next.t) < 0.02) {
      if (next.dur > prev.dur) {
        prev.dur = next.dur;
        if ("sustain" in prev) prev.sustain = Boolean(next.sustain || next.dur >= 0.14);
      }
      continue;
    }
    out.push(next);
  }
  return out;
}

/** Phone play: one tap at a time, less spam. Holds stay — you still have to keep the lane down. */
export function simplifyNotesForTouch<
  T extends { t: number; lane: number; dur: number; sustain?: boolean },
>(notes: T[]): T[] {
  const out: T[] = [];
  const minGap = 0.2;
  for (const note of notes) {
    const next = { ...note };
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(next);
      continue;
    }
    if (next.t - prev.t < 0.05) {
      if (next.dur > prev.dur) {
        prev.dur = next.dur;
        if ("sustain" in prev) prev.sustain = Boolean(next.sustain || next.dur >= 0.14);
      }
      continue;
    }
    if (next.t - prev.t < minGap) continue;
    out.push(next);
  }
  return out;
}

export function isHeroTouchPlay(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.native === "1") return true;
  return window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
}
