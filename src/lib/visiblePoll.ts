/** Run `tick` on an interval only while the tab is visible. Wakes on focus. */
export function startVisiblePoll(
  tick: () => void,
  intervalMs: number,
): () => void {
  let id: number | null = null;

  const stop = () => {
    if (id == null) return;
    window.clearInterval(id);
    id = null;
  };

  const start = () => {
    stop();
    if (document.visibilityState !== "visible") return;
    id = window.setInterval(tick, intervalMs);
  };

  const onWake = () => {
    if (document.visibilityState === "visible") {
      tick();
      start();
    } else {
      stop();
    }
  };

  start();
  window.addEventListener("focus", onWake);
  document.addEventListener("visibilitychange", onWake);
  return () => {
    stop();
    window.removeEventListener("focus", onWake);
    document.removeEventListener("visibilitychange", onWake);
  };
}
