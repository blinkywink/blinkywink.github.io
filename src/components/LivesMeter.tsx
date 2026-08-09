import { useEffect, useRef, useState } from "react";

type Props = {
  maxAttempts: number;
  attemptsUsed: number;
};

/**
 * BTD6-style lives row using the upscaled wiki lives icon.
 */
export function LivesMeter({ maxAttempts, attemptsUsed }: Props) {
  const remaining = Math.max(0, maxAttempts - attemptsUsed);
  const prevUsed = useRef(attemptsUsed);
  const [shatteringIndex, setShatteringIndex] = useState<number | null>(null);

  useEffect(() => {
    if (attemptsUsed > prevUsed.current) {
      // Hearts render left→right; the rightmost living one is lost first.
      const lostIndex = maxAttempts - attemptsUsed;
      setShatteringIndex(lostIndex);
      const t = window.setTimeout(() => setShatteringIndex(null), 720);
      prevUsed.current = attemptsUsed;
      return () => window.clearTimeout(t);
    }
    prevUsed.current = attemptsUsed;
    if (attemptsUsed === 0) setShatteringIndex(null);
  }, [attemptsUsed, maxAttempts]);

  return (
    <div className="lives-meter" aria-label={`${remaining} lives left`}>
      {Array.from({ length: maxAttempts }, (_, i) => {
        const isShattering = shatteringIndex === i;
        const alive = i < remaining;
        return (
          <span
            key={i}
            className={[
              "lives-meter__heart",
              alive ? "is-alive" : "",
              !alive && !isShattering ? "is-lost" : "",
              isShattering ? "is-shattering" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <img
              src="/images/ui/lives-heart.webp"
              alt=""
              width={40}
              height={36}
              draggable={false}
            />
          </span>
        );
      })}
    </div>
  );
}
