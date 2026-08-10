/** Multi-stem Clone Hero pack audio — play song + guitar + drums + vocals together. */

import { isDesktopShell } from "../../lib/desktopOnline";

export type StemPlayer = {
  /** Primary clock stem (song.* when present, else longest). */
  master: HTMLAudioElement;
  stems: HTMLAudioElement[];
  /** Pack includes a dedicated vocals/voice stem. */
  hasVocalsStem: boolean;
  get duration(): number;
  get currentTime(): number;
  set currentTime(t: number);
  get paused(): boolean;
  get ended(): boolean;
  play: () => Promise<void>;
  pause: () => void;
  setVolume: (v: number) => void;
  /** 0–1 vocals loudness (0 if no vocals stem). */
  getVocalsLevel: () => number;
  destroy: () => void;
};

/** Target RMS (sample absolute) after normalization. */
const TARGET_RMS = 0.11;
/** Soft peak ceiling so boosts don’t clip hard. */
const PEAK_CEILING = 0.95;
const NORM_GAIN_MIN = 0.4;
const NORM_GAIN_MAX = 2.6;

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

function copyToArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return buf;
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

function isVocalsStemName(name: string): boolean {
  const base = name.replace(/^.*[/\\]/, "").toLowerCase();
  return /^(vocals?|voice)([_\-.]|$)/.test(base);
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

/**
 * Estimate perceived loudness from a stem (strided peak + RMS).
 * Used to normalize packs that ship at very different masters.
 */
async function analyzeLoudness(
  data: Uint8Array,
): Promise<{ peak: number; rms: number } | null> {
  if (typeof OfflineAudioContext === "undefined") return null;
  try {
    const offline = new OfflineAudioContext(1, 1, 44100);
    const decoded = await offline.decodeAudioData(copyToArrayBuffer(data));
    let peak = 0;
    let sumSq = 0;
    let n = 0;
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      // ~200k samples max per channel keeps load snappy on long charts.
      const step = Math.max(1, Math.floor(ch.length / 200_000));
      for (let i = 0; i < ch.length; i += step) {
        const a = Math.abs(ch[i]!);
        if (a > peak) peak = a;
        sumSq += a * a;
        n += 1;
      }
    }
    if (n <= 0 || peak < 1e-5) return null;
    return { peak, rms: Math.sqrt(sumSq / n) };
  } catch {
    return null;
  }
}

function normalizeGainFromLoudness(peak: number, rms: number): number {
  const byRms = TARGET_RMS / Math.max(rms, 1e-4);
  const byPeak = PEAK_CEILING / Math.max(peak, 1e-4);
  // Prefer RMS matching; never push the peak past the ceiling.
  return Math.min(NORM_GAIN_MAX, Math.max(NORM_GAIN_MIN, Math.min(byRms, byPeak)));
}

export async function createStemPlayer(
  stems: { name: string; data: Uint8Array }[],
  volume: number,
): Promise<{ player: StemPlayer; urls: string[] }> {
  if (!stems.length) throw new Error("No song audio found in chart pack");

  /** WKWebView/Tauri: Web Audio + multi MediaElementSource drifts and glitches. */
  const useSimpleAudio = isDesktopShell();

  const urls: string[] = [];
  const elements: HTMLAudioElement[] = [];

  for (const stem of stems) {
    const url = URL.createObjectURL(
      new Blob([asBlobPart(stem.data)], { type: mimeForName(stem.name) }),
    );
    urls.push(url);
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = 1;
    // MediaElementSource requires CORS-friendly media; blob URLs are fine.
    audio.crossOrigin = "anonymous";
    elements.push(audio);
  }

  const songIdx = stems.findIndex((s) => /^song\./i.test(s.name));
  const analyzeIdx =
    songIdx >= 0
      ? songIdx
      : stems.findIndex((s) => !isVocalsStemName(s.name));
  const loudness =
    !useSimpleAudio && analyzeIdx >= 0
      ? await analyzeLoudness(stems[analyzeIdx]!.data)
      : null;
  const normGain = loudness
    ? normalizeGainFromLoudness(loudness.peak, loudness.rms)
    : 1;

  await Promise.all(elements.map((a) => waitReady(a)));

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

  const vocalIdx = stems.findIndex((s) => isVocalsStemName(s.name));
  const hasVocalsStem = vocalIdx >= 0;
  const vocalsEl = hasVocalsStem ? elements[vocalIdx]! : null;

  let audioCtx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timeData: Uint8Array<ArrayBuffer> | null = null;
  let smooth = 0;
  let userVolume = Math.min(1, Math.max(0, volume));
  let graphReady = false;
  let graphFailed = useSimpleAudio;

  const applyOutputGain = () => {
    const g = userVolume * normGain;
    if (masterGain) {
      masterGain.gain.value = g;
      return;
    }
    // Fallback without Web Audio: can only attenuate (HTML volume ≤ 1).
    const htmlVol = Math.min(1, g);
    for (const el of elements) el.volume = htmlVol;
  };

  const ensureGraph = () => {
    if (graphReady || graphFailed || typeof AudioContext === "undefined") return;
    try {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      for (const el of elements) {
        el.volume = 1;
        const src = audioCtx.createMediaElementSource(el);
        if (vocalsEl && el === vocalsEl) {
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.65;
          src.connect(analyser);
          analyser.connect(masterGain);
          timeData = new Uint8Array(analyser.fftSize);
        } else {
          src.connect(masterGain);
        }
      }
      applyOutputGain();
      graphReady = true;
    } catch {
      graphFailed = true;
      audioCtx = null;
      masterGain = null;
      analyser = null;
      timeData = null;
      applyOutputGain();
    }
  };

  const player: StemPlayer = {
    master,
    stems: elements,
    hasVocalsStem,
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
      const clamped = Math.max(0, t);
      for (const el of elements) {
        try {
          el.currentTime = clamped;
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
      if (!useSimpleAudio) ensureGraph();
      if (audioCtx && audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {
          /* ignore */
        }
      }
      const t = master.currentTime;
      for (const el of elements) {
        if (Math.abs(el.currentTime - t) > 0.02) {
          try {
            el.currentTime = t;
          } catch {
            /* ignore */
          }
        }
      }
      // Start together — never re-seek stems mid-playback (causes repeats on WebKit).
      await Promise.all(
        elements.map(async (el) => {
          if (!el.paused && !el.ended) return;
          try {
            await el.play();
          } catch {
            /* ignore */
          }
        }),
      );
    },
    pause() {
      for (const el of elements) el.pause();
    },
    setVolume(v: number) {
      userVolume = Math.min(1, Math.max(0, v));
      applyOutputGain();
    },
    getVocalsLevel() {
      if (!analyser || !timeData) return 0;
      analyser.getByteTimeDomainData(timeData as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeData.length);
      const level = Math.min(1, Math.max(0, (rms - 0.015) / 0.14));
      smooth = smooth * 0.4 + level * 0.6;
      return smooth;
    },
    destroy() {
      for (const el of elements) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      elements.length = 0;
      try {
        void audioCtx?.close();
      } catch {
        /* ignore */
      }
      audioCtx = null;
      masterGain = null;
      analyser = null;
      timeData = null;
    },
  };

  // Prefetch graph once a user gesture exists later; still apply HTML fallback now.
  applyOutputGain();

  return { player, urls };
}
