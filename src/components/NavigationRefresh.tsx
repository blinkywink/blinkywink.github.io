import { useLayoutEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { invalidateCachesForRoute } from "../lib/navigationRefresh";

/** Invalidate stale caches before route views fetch (runs before child useEffects). */
export function NavigationRefresh({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    invalidateCachesForRoute(pathname);
  }, [pathname]);

  return children;
}
