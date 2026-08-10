/** Lightweight placeholder while lazy routes load. */
export function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      Loading…
    </div>
  );
}
