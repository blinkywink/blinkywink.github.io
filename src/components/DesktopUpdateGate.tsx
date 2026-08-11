import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktopShell } from "../lib/desktopOnline";
import {
  DESKTOP_MAC_DMG,
  DESKTOP_WINDOWS_SETUP,
  fetchDesktopRemoteConfig,
  isOlderVersion,
  type DesktopRemoteConfig,
} from "../lib/desktopDownloads";

type GateStatus =
  | "idle"
  | "downloading"
  | "ready"
  | "required"
  | "blocked"
  | "error";

export function DesktopUpdateGate() {
  const [status, setStatus] = useState<GateStatus>("idle");
  const [required, setRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [config, setConfig] = useState<DesktopRemoteConfig | null>(null);
  const [targetVersion, setTargetVersion] = useState("");
  const updateRef = useRef<{
    install: () => Promise<void>;
    close: () => Promise<void>;
  } | null>(null);

  const requiredRef = useRef(false);
  requiredRef.current = required;

  const applyRestart = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    const must = requiredRef.current;
    setStatus(must ? "required" : "downloading");
    setMessage(
      targetVersion
        ? `Restarting into ${targetVersion}…`
        : "Restarting to finish the update…",
    );
    try {
      await update.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      console.warn("Desktop update restart failed", err);
      setStatus(must ? "blocked" : "error");
      setMessage(
        must
          ? "Could not finish the update. Download the latest app below."
          : "Could not restart into the update. You can keep playing.",
      );
    }
  }, [targetVersion]);

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
    const mustUpdate = remote
      ? isOlderVersion(current, remote.minDesktopVersion)
      : false;

    setConfig(remote);
    setRequired(mustUpdate);
    if (mustUpdate) {
      setMessage(
        remote?.message ??
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
          remote?.message ??
            "This desktop app is out of date. Download the latest version to keep playing.",
        );
        return;
      }
      console.warn("Desktop update check failed", err);
      return;
    }

    if (!update) {
      if (mustUpdate) setStatus("blocked");
      return;
    }

    updateRef.current = update;
    setTargetVersion(update.version);
    setStatus(mustUpdate ? "required" : "downloading");
    setMessage(
      mustUpdate
        ? `Version ${current} is no longer supported. Installing ${update.version}…`
        : `Downloading update ${update.version}…`,
    );

    let downloaded = 0;
    let total = 0;
    try {
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
      if (mustUpdate) {
        setMessage(`Restarting into ${update.version}…`);
        await update.install();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
        return;
      }
      setStatus("ready");
      setMessage(`Version ${update.version} is ready. Restart to update.`);
    } catch (err) {
      console.warn("Desktop update download failed", err);
      setStatus(mustUpdate ? "blocked" : "error");
      setMessage(
        mustUpdate
          ? "Could not install the update automatically. Download the latest app below."
          : "Could not download the update. You can keep playing.",
      );
    }
  }, []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    void run();
    return () => {
      void updateRef.current?.close();
    };
  }, [run]);

  if (!isDesktopShell() || status === "idle") return null;

  const mac = config?.downloadMac ?? DESKTOP_MAC_DMG;
  const win = config?.downloadWindows ?? DESKTOP_WINDOWS_SETUP;

  if (status === "ready" || (status === "downloading" && !required)) {
    return (
      <div className="desktop-update-toast" role="status">
        <p>
          {status === "ready"
            ? message
            : targetVersion
              ? `Downloading ${targetVersion}…`
              : "Checking for updates…"}
        </p>
        {status === "downloading" ? (
          <div
            className="desktop-update-toast__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress == null ? undefined : Math.round(progress)}
          >
            <div
              className="desktop-update-toast__bar"
              style={{
                width: progress == null ? "40%" : `${progress}%`,
                opacity: progress == null ? 0.7 : 1,
              }}
            />
          </div>
        ) : (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void applyRestart()}>
            Restart
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="desktop-online-gate" role="alertdialog" aria-modal="true">
      <div className="desktop-online-gate__card">
        <h1>
          {required || status === "blocked"
            ? "Update required"
            : "Updating blinkywink.co"}
        </h1>
        <p>{message}</p>
        {status === "required" ? (
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
            {!required ? (
              <button type="button" className="btn" onClick={() => setStatus("idle")}>
                Continue
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
