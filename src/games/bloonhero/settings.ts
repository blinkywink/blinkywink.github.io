/** Bloon Hero player settings (persisted). */

export type HeroKeybinds = [string, string, string, string, string];

export type HeroSettings = {
  /** 0.7–1.8 — higher = notes travel faster (shorter approach). */
  trackSpeed: number;
  /** Keys for lanes 0–4. Lowercase. */
  keys: HeroKeybinds;
};

const KEY = "bloonhero-settings-v1";
export const DEFAULT_KEYS: HeroKeybinds = ["d", "f", "j", "k", "l"];
export const DEFAULT_SETTINGS: HeroSettings = {
  trackSpeed: 1,
  keys: [...DEFAULT_KEYS] as HeroKeybinds,
};

export function readHeroSettings(): HeroSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, keys: [...DEFAULT_KEYS] as HeroKeybinds };
    const parsed = JSON.parse(raw) as Partial<HeroSettings>;
    const keys = Array.isArray(parsed.keys)
      ? (parsed.keys.map((k, i) =>
          typeof k === "string" && k.length ? k.toLowerCase() : DEFAULT_KEYS[i],
        ) as HeroKeybinds)
      : ([...DEFAULT_KEYS] as HeroKeybinds);
    const trackSpeed = Number(parsed.trackSpeed);
    return {
      trackSpeed:
        Number.isFinite(trackSpeed) && trackSpeed >= 0.6 && trackSpeed <= 2
          ? trackSpeed
          : 1,
      keys,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, keys: [...DEFAULT_KEYS] as HeroKeybinds };
  }
}

export function writeHeroSettings(next: HeroSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function keyToLaneMap(keys: HeroKeybinds): Record<string, number> {
  const out: Record<string, number> = {};
  keys.forEach((k, i) => {
    out[k.toLowerCase()] = i;
  });
  return out;
}
