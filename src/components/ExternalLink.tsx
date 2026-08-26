import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { isDesktopShell } from "../lib/desktopOnline";
import { isNativeShell } from "../lib/nativeShell";
import { openExternal } from "../lib/openExternal";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
};

/**
 * External http(s) link — desktop/native open the system browser; web uses a tab.
 */
export function ExternalLink({ href, children, onClick, ...rest }: Props) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (!isDesktopShell() && !isNativeShell()) return;
    e.preventDefault();
    void openExternal(href);
  };

  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
