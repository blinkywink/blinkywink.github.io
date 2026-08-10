/** Multi-stem Clone Hero pack audio — play song + guitar + drums + vocals together. */

export type StemPlayer = {
  /** Primary clock stem (song.* when present, else longest). */
  master: HTMLAudioElement;
  stems: HTMLAudioElement[];
  get duration(): number;
  get currentTime(): number;
  set currentTime(t: number);
  get paused(): boolean;
  get ended(): boolean;
  play: () => Promise<void>;
  pause: () => void;
  setVolume: (v: number) => void;
  destroy: () => void;
};

function mimeForName(name: string): string {
  if (name.endsWith(".opus")) return "audio/opus";
  if (name.endsWith(".ogg")) return "audio/ogg";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".m4a")) return "audio/mp4";
  return "audio/mpeg";
}

function asBlobPart(data: Uint8Array): BlobPart {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

/** Clone Hero / RB stem filenames (ignore album art / previews). */
export function isAudioStemFile(name: string): boolean {
  const base = name.replace(/^.*[/\\]/, "").toLowerCase();
  if (!/\.(opus|ogg|mp3|wav|m4a)$/.test(base)) return false;
  if (/(^|[_\-.])(preview|album|desktop|background|cover)([_\-.]|$)/.test(base))
    return false;
  return /^(song|guitar|bass|rhythm|drums?\d*|vocals?|voice|keys|crowd|backing|music)([_\-.]|$)/.test(
    base,
  );
}

function waitReady(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("Could not load stem audio"));
    };
    const cleanup = () => {
      audio.removeEventListener("canplaythrough", ok);
      audio.removeEventListener("error", fail);
    };
    audio.addEventListener("canplaythrough", ok, { once: true });
    audio.addEventListener("error", fail, { once: true });
    audio.load();
    if (audio.readyState >= 3) ok();
  });
}

export async function createStemPlayer(
  stems: { name: string; data: Uint8Array }[],
  volume: number,
): Promise<{ player: StemPlayer; urls: string[] }> {
  if (!stems.length) throw new Error("No song audio found in chart pack");

  const urls: string[] = [];
  const elements: HTMLAudioElement[] = [];

  for (const stem of stems) {
    const url = URL.createObjectURL(
      new Blob([asBlobPart(stem.data)], { type: mimeForName(stem.name) }),
    );
    urls.push(url);
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = volume;
    elements.push(audio);
  }

  await Promise.all(elements.map((a) => waitReady(a)));

  const songIdx = stems.findIndex((s) => /^song\./i.test(s.name));
  let master = songIdx >= 0 ? elements[songIdx]! : elements[0]!;
  if (songIdx < 0) {
    let best = 0;
    for (const el of elements) {
      if (Number.isFinite(el.duration) && el.duration > best) {
        best = el.duration;
        master = el;
      }
    }
  }

  const player: StemPlayer = {
    master,
    stems: elements,
    get duration() {
      let d = 0;
      for (const el of elements) {
        if (Number.isFinite(el.duration) && el.duration > d) d = el.duration;
      }
      return d;
    },
    get currentTime() {
      return master.currentTime;
    },
    set currentTime(t: number) {
      for (const el of elements) {
        try {
          el.currentTime = t;
        } catch {
          /* ignore seek race */
        }
      }
    },
    get paused() {
      return master.paused;
    },
    get ended() {
      return master.ended;
    },
    async play() {
      const t = master.currentTime;
      for (const el of elements) {
        if (Math.abs(el.currentTime - t) > 0.04) {
          try {
            el.currentTime = t;
          } catch {
            /* ignore */
          }
        }
      }
      await Promise.all(elements.map((el) => el.play().catch(() => {})));
    },
    pause() {
      for (const el of elements) el.pause();
    },
    setVolume(v: number) {
      const vol = Math.min(1, Math.max(0, v));
      for (const el of elements) el.volume = vol;
    },
    destroy() {
      for (const el of elements) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      elements.length = 0;
    },
  };

  return { player, urls };
}
