import { Component, type ErrorInfo, type ReactNode } from "react";

const RELOAD_KEY = "bloon-arcade:blank-recover";
const RELOAD_COOLDOWN_MS = 15_000;

function recentReloadAttempt(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloadAttempt() {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** True for Vite/webpack chunk fetch failures after a deploy. */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
}

/**
 * Soft-recover from a blank/crashed React tree.
 * Reloads once per cooldown; otherwise shows a simple retry card.
 */
export function recoverFromBlank(reason: string): boolean {
  if (typeof window === "undefined") return false;
  if (recentReloadAttempt()) return false;
  console.warn(`[recover] reloading (${reason})`);
  markReloadAttempt();
  window.location.reload();
  return true;
}

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render/chunk errors that would otherwise blank the whole app
 * (no header, just the CSS background). Auto-refreshes once.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
    if (recoverFromBlank(isChunkLoadError(error) ? "chunk" : "render")) {
      return;
    }
  }

  private retry = () => {
    this.setState({ error: null });
    window.location.assign(window.location.href);
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-crash" role="alert">
        <div className="app-crash__card">
          <h1>Something went wrong</h1>
          <p>The page crashed. Refresh usually fixes it.</p>
          <button type="button" className="btn btn--primary" onClick={this.retry}>
            Refresh
          </button>
        </div>
      </div>
    );
  }
}
