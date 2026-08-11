import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const FIRST_PAGE = 24;
const NEXT_PAGE = 20;

type Props<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  itemClassName?: (item: T) => string;
  /** Reset the window when search / sort / view changes. */
  resetKey: string;
  pageSize?: number;
};

/** Renders the first chunk of a card grid, then more as you scroll. */
export function VisibleCardGrid<T>({
  items,
  getKey,
  renderItem,
  itemClassName,
  resetKey,
  pageSize = FIRST_PAGE,
}: Props<T>) {
  const [shown, setShown] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShown(pageSize);
  }, [resetKey, pageSize]);

  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || remaining <= 0) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(items.length);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown((n) => Math.min(items.length, n + NEXT_PAGE));
      },
      { rootMargin: "720px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [remaining, items.length]);

  return (
    <>
      <div className="card-lab__grid">
        {visible.map((item) => (
          <div
            key={getKey(item)}
            className={["card-lab__cell", itemClassName?.(item)]
              .filter(Boolean)
              .join(" ")}
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
      {remaining > 0 ? (
        <div
          ref={sentinelRef}
          className="card-lab__more"
          aria-live="polite"
        >
          Showing {visible.length} of {items.length}
        </div>
      ) : items.length > pageSize ? (
        <p className="card-lab__more card-lab__more--done">
          {items.length} cards
        </p>
      ) : null}
    </>
  );
}
