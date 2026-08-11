import { useCallback, useEffect, useState } from "react";
import { isDesktopShell } from "../lib/desktopOnline";
import {
  DESKTOP_MAC_DMG,
  DESKTOP_WINDOWS_SETUP,
  fetchDesktopRemoteConfig,
  isOlderVersion,
  type DesktopRemoteConfig,
} from "../lib/desktopDownloads";

type GateStatus = "idle" | "updating" | "blocked" | "error";

export function DesktopUpdateGate() {
  const [status, setStatus] = useState<GateStatus>("idle");
  const [required, setRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [config, setConfig] = useState<DesktopRemoteConfig | null>(null);
  const [targetVersion, setTargetVersion] = useState("");

  const run = useCallback(async () => {
    if (!isDesktopShell()) return;

    setStatus("idle");
    setProgress(null);

    const [{ getVersion }, { check }, remote] = await Promise.all([
      import("@tauri-apps/api/app"),
      import("@tauri-apps/plugin-updater"),
      fetchDesktopRemoteConfig(),
    ]);

    const current = await getVersion();
    const nextConfig = remote;
    const mustUpdate = nextConfig
      ? isOlderVersion(current, nextConfig.minDesktopVersion)
      : false;

    setConfig(nextConfig);
    setRequired(mustUpdate);
    if (mustUpdate) {
      setMessage(
        nextConfig?.message ??
          "This desktop app is out of date. Update to keep playing.",
      );
    }

    let update: Awaited<ReturnType<typeof check>> = null;
    try {
      update = await check({ timeout: 15_000 });
    } catch (err) {
      if (mustUpdate) {
        setStatus("blocked");
        setMessage(
          nextConfig?.message ??
            "This desktop app is out of date. Download the latest version to keep playing.",
        );
        return;
      }
      console.warn("Desktop update check failed", err);
      return;
    }

    if (!update) {
      if (mustUpdate) {
        setStatus("blocked");
      }
      return;
    }

    setTargetVersion(update.version);
    setStatus("updating");
    setMessage(
      mustUpdate
        ? `Version ${current} is no longer supported. Installing ${update.version}…`
        : `Installing update ${update.version}…`,
    );

    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
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
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      console.warn("Desktop update install failed", err);
      setStatus(mustUpdate ? "blocked" : "error");
      setMessage(
        mustUpdate
          ? "Could not install the update automatically. Download the latest app below."
          : "Could not install the update. You can keep playing, or download the latest app.",
      );
    }
  }, []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    void run();
  }, [run]);

  if (!isDesktopShell() || status === "idle") return null;

  const mac = config?.downloadMac ?? DESKTOP_MAC_DMG;
  const win = config?.downloadWindows ?? DESKTOP_WINDOWS_SETUP;

  return (
    <div className="desktop-online-gate" role="alertdialog" aria-modal="true">
      <div className="desktop-online-gate__card">
        <h1>
          {required || status === "blocked"
            ? "Update required"
            : "Updating blinkywink.co"}
        </h1>
        <p>{message}</p>
        {status === "updating" ? (
          <div
            className="desktop-online-gate__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress == null ? undefined : Math.round(progress)}
            aria-label={
              targetVersion
                ? `Downloading update ${targetVersion}`
                : "Downloading update"
            }
          >
            <div
              className="desktop-online-gate__progress-bar"
              style={{
                width: progress == null ? "40%" : `${progress}%`,
                opacity: progress == null ? 0.7 : 1,
              }}
            />
          </div>
        ) : null}
        {status === "blocked" || status === "error" ? (
          <div className="desktop-online-gate__actions">
            <a
              href={mac}
              className="btn btn--primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Mac
            </a>
            <a
              href={win}
              className="btn btn--primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Windows
            </a>
            <button type="button" className="btn" onClick={() => void run()}>
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
