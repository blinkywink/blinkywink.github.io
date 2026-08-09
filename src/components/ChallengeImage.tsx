import { useEffect, useRef, useState } from "react";
import type { DifficultyConfig } from "../games/zoomed/config";
import {
  generateTransform,
  preloadImage,
  renderChallenge,
  zoomOutTransform,
  type TransformParams,
} from "../utils/imageProcessing";

type FlashKind = "miss" | "correct" | null;

type Props = {
  imageSrc: string;
  difficulty: DifficultyConfig;
  /** Bumps to force a fresh transform even for the same image. */
  seed: string;
  /** Extra zoom-out steps after wrong guesses (0 = original crop). */
  zoomOutSteps?: number;
  flash?: FlashKind;
  /** Points to show during the correct flash. */
  flashPoints?: number;
  /** Reports the active crop so the reveal screen can map it. */
  onTransformChange?: (transform: TransformParams) => void;
};

export function ChallengeImage({
  imageSrc,
  difficulty,
  seed,
  zoomOutSteps = 0,
  flash = null,
  flashPoints,
  onTransformChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseTransform = useRef<TransformParams | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    baseTransform.current = null;
  }, [seed, imageSrc, difficulty]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setReady(false);
    setError(null);

    void (async () => {
      try {
        const img = await preloadImage(imageSrc);
        if (!baseTransform.current) {
          baseTransform.current = generateTransform(img, difficulty);
        }
        const transform = zoomOutTransform(
          baseTransform.current,
          img.naturalWidth,
          img.naturalHeight,
          zoomOutSteps,
        );
        await renderChallenge(canvas, imageSrc, difficulty, 640, transform);
        if (!cancelled) {
          setReady(true);
          onTransformChange?.(transform);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageSrc, difficulty, seed, zoomOutSteps, onTransformChange]);

  return (
    <div
      className={[
        "challenge-frame",
        ready ? "is-ready" : "",
        flash === "miss" ? "is-miss-flash" : "",
        flash === "correct" ? "is-correct-flash" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <canvas
        ref={canvasRef}
        className="challenge-canvas"
        width={640}
        height={640}
        aria-label="Zoomed mystery tower"
      />
      {!ready && !error ? (
        <div className="challenge-frame__loading" aria-hidden="true">
          <div className="pulse-dot" />
        </div>
      ) : null}
      {error ? <p className="challenge-frame__error">{error}</p> : null}
      <div className="challenge-frame__badge">{difficulty.tier}</div>
      {zoomOutSteps > 0 && !flash ? (
        <div className="challenge-frame__hint">Zoomed out</div>
      ) : null}

      {flash === "miss" ? (
        <div className="challenge-flash challenge-flash--miss" aria-hidden="true">
          <div className="challenge-flash__veil" />
          <div className="challenge-flash__mark">✕</div>
        </div>
      ) : null}

      {flash === "correct" ? (
        <div
          className="challenge-flash challenge-flash--correct"
          aria-hidden="true"
        >
          <div className="challenge-flash__veil" />
          <div className="challenge-flash__mark">✓</div>
          {flashPoints != null ? (
            <div className="challenge-flash__points">+{flashPoints}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
