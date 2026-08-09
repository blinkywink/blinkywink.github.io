import { useEffect, useRef, useState } from "react";
import { preloadImage, type TransformParams } from "../utils/imageProcessing";

type Props = {
  imageSrc: string;
  name: string;
  transform: TransformParams | null;
};

/** Full art with the crop region highlighted. */
export function AnswerReveal({ imageSrc, name, transform }: Props) {
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const img = await preloadImage(imageSrc);
        const mapCanvas = mapCanvasRef.current;
        if (!mapCanvas) return;

        const maxSide = 640;
        const fit = Math.min(
          maxSide / img.naturalWidth,
          maxSide / img.naturalHeight,
        );
        const drawW = Math.round(img.naturalWidth * fit);
        const drawH = Math.round(img.naturalHeight * fit);
        mapCanvas.width = drawW;
        mapCanvas.height = drawH;
        const mctx = mapCanvas.getContext("2d")!;
        mctx.clearRect(0, 0, drawW, drawH);
        mctx.drawImage(img, 0, 0, drawW, drawH);

        if (transform) {
          const rx = transform.cropX * fit;
          const ry = transform.cropY * fit;
          const rw = transform.cropW * fit;
          const rh = transform.cropH * fit;

          mctx.fillStyle = "rgba(12, 34, 56, 0.55)";
          mctx.fillRect(0, 0, drawW, drawH);
          mctx.clearRect(rx, ry, rw, rh);
          mctx.drawImage(
            img,
            transform.cropX,
            transform.cropY,
            transform.cropW,
            transform.cropH,
            rx,
            ry,
            rw,
            rh,
          );

          mctx.strokeStyle = "#d8d8e2";
          mctx.lineWidth = Math.max(3, 4 * fit);
          mctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);

          mctx.strokeStyle = "#12304a";
          mctx.lineWidth = Math.max(1.5, 2 * fit);
          mctx.strokeRect(rx, ry, rw, rh);
        }

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageSrc, transform]);

  return (
    <div className={`answer-reveal ${ready ? "is-ready" : ""}`}>
      <div className="answer-reveal__frame answer-reveal__frame--map">
        <canvas
          ref={mapCanvasRef}
          className="answer-reveal__canvas"
          aria-label={`${name} with zoom region highlighted`}
        />
        <span className="answer-reveal__label">Where on the art</span>
      </div>
    </div>
  );
}
