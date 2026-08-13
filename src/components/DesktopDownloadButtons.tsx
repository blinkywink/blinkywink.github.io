import {
  DESKTOP_MAC_DMG,
  DESKTOP_WINDOWS_SETUP,
} from "../lib/desktopDownloads";
import { ExternalLink } from "./ExternalLink";

type Props = {
  className?: string;
  macHref?: string;
  windowsHref?: string;
};

/** Windows first, then Mac. */
export function DesktopDownloadButtons({
  className = "",
  macHref = DESKTOP_MAC_DMG,
  windowsHref = DESKTOP_WINDOWS_SETUP,
}: Props) {
  return (
    <div className={`home-hub__download-actions ${className}`.trim()}>
      <ExternalLink
        href={windowsHref}
        className="home-hub__download-btn home-hub__download-btn--win"
      >
        <svg viewBox="0 0 16 16" aria-hidden focusable="false">
          <rect x="0" y="0" width="7" height="7" />
          <rect x="9" y="0" width="7" height="7" />
          <rect x="0" y="9" width="7" height="7" />
          <rect x="9" y="9" width="7" height="7" />
        </svg>
        Windows
      </ExternalLink>
      <ExternalLink
        href={macHref}
        className="home-hub__download-btn home-hub__download-btn--mac"
      >
        <svg viewBox="0 0 24 24" aria-hidden focusable="false">
          <path d="M16.13 12.87c-.02-2.17 1.77-3.21 1.85-3.26-1.01-1.47-2.58-1.67-3.13-1.7-1.33-.14-2.6.78-3.28.78-.68 0-1.73-.76-2.85-.74-1.47.02-2.82.85-3.58 2.16-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.85.69 1.18-.02 1.93-1.07 2.65-2.12.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.45zm-2.17-6.3c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.33-.56.65-1.05 1.69-.92 2.69.97.08 1.96-.49 2.58-1.22z" />
        </svg>
        Mac
      </ExternalLink>
    </div>
  );
}
