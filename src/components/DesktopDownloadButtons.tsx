import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  DESKTOP_MAC_DMG,
  DESKTOP_WINDOWS_SETUP,
} from "../lib/desktopDownloads";
import { MOBILE_APK_URL, MOBILE_IPA_URL } from "../lib/mobileUpdates";
import { DISCORD_INVITE_URL } from "../lib/openExternal";
import { ExternalLink } from "./ExternalLink";

type Props = {
  className?: string;
  macHref?: string;
  windowsHref?: string;
  androidHref?: string;
  iosHref?: string;
};

function IosSideloadDialog({
  open,
  onClose,
  iosHref,
}: {
  open: boolean;
  onClose: () => void;
  iosHref: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ios-sideload" role="presentation">
      <button
        type="button"
        className="ios-sideload__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="ios-sideload__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>iOS install</h2>
        <p>
          This app isn’t on the App Store — it has to be sideloaded. Need help?
          Ask in the Discord and someone can walk you through it.
        </p>
        <div className="ios-sideload__actions">
          <ExternalLink href={DISCORD_INVITE_URL} className="btn btn--primary">
            Ask in Discord
          </ExternalLink>
          <ExternalLink href={iosHref} className="btn btn--secondary">
            Download IPA
          </ExternalLink>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Windows, Mac, Android APK, iOS (sideload notice). */
export function DesktopDownloadButtons({
  className = "",
  macHref = DESKTOP_MAC_DMG,
  windowsHref = DESKTOP_WINDOWS_SETUP,
  androidHref = MOBILE_APK_URL,
  iosHref = MOBILE_IPA_URL,
}: Props) {
  const [iosOpen, setIosOpen] = useState(false);

  return (
    <>
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
        <ExternalLink
          href={androidHref}
          className="home-hub__download-btn home-hub__download-btn--android"
        >
          <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path
              fill="currentColor"
              d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67c-.19-.29-.54-.38-.83-.22-.3.16-.42.54-.26.85L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"
            />
          </svg>
          Android
        </ExternalLink>
        <button
          type="button"
          className="home-hub__download-btn home-hub__download-btn--ios"
          onClick={() => setIosOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path d="M16.13 12.87c-.02-2.17 1.77-3.21 1.85-3.26-1.01-1.47-2.58-1.67-3.13-1.7-1.33-.14-2.6.78-3.28.78-.68 0-1.73-.76-2.85-.74-1.47.02-2.82.85-3.58 2.16-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.85.69 1.18-.02 1.93-1.07 2.65-2.12.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.45zm-2.17-6.3c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.33-.56.65-1.05 1.69-.92 2.69.97.08 1.96-.49 2.58-1.22z" />
          </svg>
          iOS
        </button>
      </div>
      <IosSideloadDialog
        open={iosOpen}
        onClose={() => setIosOpen(false)}
        iosHref={iosHref}
      />
    </>
  );
}
