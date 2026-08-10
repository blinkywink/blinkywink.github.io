import { useEffect, useRef } from "react";
import { CATCH_BGM_TRACKS, CATCH_BGM_VOLUME } from "./bgmTracks";
import type { CatchPhase } from "./useBananaCatch";

function shuffleOrder(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Quiet random BGM while Banana Catch is actively playing. */
export function useCatchBgm(phase: CatchPhase) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const orderRef = useRef<number[]>([]);
  const cursorRef = useRef(0);
  const playNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!CATCH_BGM_TRACKS.length) return;

    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = CATCH_BGM_VOLUME;
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
      audio.volume = CATCH_BGM_VOLUME;
      void audio.play().catch(() => {
        /* autoplay blocked until a gesture — Start covers that */
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
    if (!audio || !CATCH_BGM_TRACKS.length) return;

    if (phase === "playing") {
      playNextRef.current();
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }, [phase]);
}
