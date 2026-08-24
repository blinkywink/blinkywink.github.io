import { useCallback, useEffect, useRef } from "react";
import { CATCH_BGM_TRACKS } from "./bgmTracks";
import type { CatchPhase } from "./useBananaCatch";

function shuffleOrder(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** BGM on the ready screen and while playing, so volume can be previewed. */
export function useCatchBgm(phase: CatchPhase, volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const orderRef = useRef<number[]>([]);
  const cursorRef = useRef(0);
  const volumeRef = useRef(clamp01(volume));
  const playNextRef = useRef<() => void>(() => {});

  volumeRef.current = clamp01(volume);

  useEffect(() => {
    if (!CATCH_BGM_TRACKS.length) return;

    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = volumeRef.current;
    audioRef.current = audio;

    const playNext = () => {
      if (
        !orderRef.current.length ||
        cursorRef.current >= orderRef.current.length
      ) {
        orderRef.current = shuffleOrder(CATCH_BGM_TRACKS.length);
        cursorRef.current = 0;
      }
      const idx = orderRef.current[cursorRef.current] ?? 0;
      cursorRef.current += 1;
      const src = CATCH_BGM_TRACKS[idx];
      if (!src) return;
      audio.src = src;
      audio.volume = volumeRef.current;
      void audio.play().catch(() => {
        /* autoplay blocked until a gesture - Start covers that */
      });
    };
    playNextRef.current = playNext;

    const onEnded = () => playNext();
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = clamp01(volume);
    if (
      audio &&
      CATCH_BGM_TRACKS.length &&
      (phase === "ready" || phase === "playing") &&
      audio.paused
    ) {
      if (!audio.src) playNextRef.current();
      else void audio.play().catch(() => undefined);
    }
  }, [volume, phase]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !CATCH_BGM_TRACKS.length) return;

    if (phase === "ready" || phase === "playing") {
      if (audio.paused) {
        if (!audio.src) playNextRef.current();
        else void audio.play().catch(() => undefined);
      }
      return;
    }

    audio.pause();
  }, [phase]);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !CATCH_BGM_TRACKS.length) return;
    audio.volume = volumeRef.current;
    if (!audio.src) playNextRef.current();
    else void audio.play().catch(() => undefined);
  }, []);

  return resume;
}
