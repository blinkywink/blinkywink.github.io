import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktopShell } from "../lib/desktopOnline";
import {
  DESKTOP_MAC_DMG,
  DESKTOP_WINDOWS_SETUP,
  fetchDesktopLatestManifest,
  fetchDesktopRemoteConfig,
  isOlderVersion,
  mergeDesktopSignals,
  type DesktopRemoteConfig,
} from "../lib/desktopDownloads";
import { dailyTowerPicks, dayStamp } from "../lib/packTheme";
import { applyRemoteFeaturedTowers } from "../lib/remoteShop";
import { ExternalLink } from "./ExternalLink";

type GateStatus = "idle" | "updating" | "blocked";

const RECHECK_MS = 90_000;

function sameTowers(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

function shopLooksStale(remote: DesktopRemoteConfig | null): boolean {
  if (!remote?.featuredTowers?.length || !remote.shopDay) return false;
  const today = dayStamp();
  if (remote.shopDay !== today) return false;
  return !sameTowers(dailyTowerPicks(3, today), remote.featuredTowers);
}

export function DesktopUpdateGate() {
  const [status, setStatus] = useState<GateStatus>("idle");
  const [message, setMessage] = useState("Updating");
  const [progress, setProgress] = useState<number | null>(null);
  const [config, setConfig] = useState<DesktopRemoteConfig | null>(null);
  const busyRef = useRef(false);
  const installingRef = useRef(false);

  const run = useCallback(async () => {
    if (!isDesktopShell() || busyRef.current || installingRef.current) return;
    busyRef.current = true;

    try {
      const [{ getVersion }, { check }, remoteCfg, latest] = await Promise.all([
        import("@tauri-apps/api/app"),
        import("@tauri-apps/plugin-updater"),
        fetchDesktopRemoteConfig(),
        fetchDesktopLatestManifest(),
      ]);

      const remote = mergeDesktopSignals(remoteCfg, latest);
      setConfig(remote);
      if (remote?.featuredTowers?.length) {
        applyRemoteFeaturedTowers(remote.featuredTowers);
      }

      const current = await getVersion();
      const shopStale = shopLooksStale(remote);
      const versionBehind = Boolean(
        remote &&
          ((remote.version && isOlderVersion(current, remote.version)) ||
            isOlderVersion(current, remote.minDesktopVersion)),
      );

      let update: Awaited<ReturnType<typeof check>> = null;
      try {
        update = await check({ timeout: 15_000 });
      } catch (err) {
        if (versionBehind || shopStale) {
          setStatus("blocked");
          setMessage("Could not reach the update server. Try again.");
        } else {
          console.warn("Desktop update check failed", err);
        }
        return;
      }

      if (!update) {
        if (versionBehind || shopStale) {
          setStatus("blocked");
          setMessage(
            shopStale
              ? "The shop changed. Download the latest app to keep playing."
              : (remote?.message ??
                "This desktop app is out of date. Download the latest version."),
          );
        }
        return;
      }

      installingRef.current = true;
      setStatus("updating");
      setMessage("Updating");
      setProgress(null);

      let downloaded = 0;
      let total = 0;
      await update.download((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          downloaded = 0;
          setProgress(total > 0 ? 0 : null);
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.min(100, (downloaded / total) * 100));
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });
      await update.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      console.warn("Desktop update failed", err);
      installingRef.current = false;
      setStatus("blocked");
      setMessage("Could not finish the update. Download the latest app below.");
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    void run();
    const id = window.setInterval(() => void run(), RECHECK_MS);
    const onWake = () => {
      if (document.visibilityState === "visible") void run();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [run]);

  if (!isDesktopShell() || status === "idle") return null;

  const mac = config?.downloadMac ?? DESKTOP_MAC_DMG;
  const win = config?.downloadWindows ?? DESKTOP_WINDOWS_SETUP;

  return (
    <div className="desktop-online-gate" role="alertdialog" aria-modal="true">
      <div className="desktop-online-gate__card">
        <h1>Updating</h1>
        <p>{message}</p>
        {status === "updating" ? (
          <div
            className="desktop-online-gate__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress == null ? undefined : Math.round(progress)}
            aria-label="Downloading update"
          >
            <div
              className="desktop-online-gate__progress-bar"
              style={{
                width: progress == null ? "40%" : `${progress}%`,
                opacity: progress == null ? 0.7 : 1,
              }}
            />
          </div>
        ) : (
          <div className="desktop-online-gate__actions">
            <ExternalLink href={win} className="btn btn--primary">
              Download Windows
            </ExternalLink>
            <ExternalLink href={mac} className="btn btn--primary">
              Download Mac
            </ExternalLink>
            <button type="button" className="btn" onClick={() => void run()}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
