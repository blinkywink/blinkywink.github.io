import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { isChunkLoadError, recoverFromBlank } from "../components/AppErrorBoundary";

/**
 * Lazy import with one retry, then a hard reload for stale chunk URLs
 * (common after a deploy when the SPA navigates without a full refresh).
 */
export function lazyRoute<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await loader();
    } catch (first) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        return await loader();
      } catch (second) {
        if (isChunkLoadError(second) || isChunkLoadError(first)) {
          recoverFromBlank("lazy-chunk");
        }
        throw second;
      }
    }
  });
}
