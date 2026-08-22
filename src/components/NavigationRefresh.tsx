import { useLayoutEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { notifyRouteEnter } from "../lib/navigationRefresh";

/** Notify route views to background-refresh (cache paints first). */
export function NavigationRefresh({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    notifyRouteEnter(pathname);
  }, [pathname]);

  return children;
}
