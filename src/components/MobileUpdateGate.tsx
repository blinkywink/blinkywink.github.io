import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeShell, nativeShellReady } from "../lib/nativeShell";
import {
  clearMobileOtaFailure,
  clearMobileOtaSkip,
  markMobileOtaApplied,
  recordMobileOtaFailure,
  shouldAutoInstallMobileOta,
  skipMobileOta,
} from "../lib/mobileOtaGuard";
import {
  MOBILE_APK_URL,
  MOBILE_IPA_URL,
  fetchMobileLatestManifest,
  needsNativeRedownload,
  needsWebUpdate,
  bundledAppVersion,
  otaBundleVersion,
  otaChecksumSuffix,
  type MobileLatestManifest,
} from "../lib/mobileUpdates";
import { ExternalLink } from "./ExternalLink";

type GateStatus = "idle" | "updating" | "blocked";

const RECHECK_MS = 90_000;
/** Let Capgo settle after reload before we decide another OTA is needed. */
const BOOT_SETTLE_MS = 2_500;
const DOWNLOAD_TIMEOUT_MS = 8 * 60_000;
const DOWNLOAD_STALL_MS = 45_000;

function watchOtaDownload<T>(
  promise: Promise<T>,
  onStall: () => void,
  progressRef: { value: number | null; at: number },
): Promise<T> {
  let stallNotified = false;
  const tick = window.setInterval(() => {
    if (progressRef.value == null) return;
    if (Date.now() - progressRef.at < DOWNLOAD_STALL_MS) return;
    if (!stallNotified) {
      stallNotified = true;
      onStall();
    }
  }, 5_000);

  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new Error("OTA download timed out")),
      DOWNLOAD_TIMEOUT_MS,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearInterval(tick);
  });
}

export function MobileUpdateGate() {
  const [status, setStatus] = useState<GateStatus>("idle");
  const [message, setMessage] = useState("Updating");
  const [progress, setProgress] = useState<number | null>(null);
  const [remote, setRemote] = useState<MobileLatestManifest | null>(null);
  const [nativeBlock, setNativeBlock] = useState(false);
  const [nativeVersionLabel, setNativeVersionLabel] = useState<string | null>(
    null,
  );
  const [skipVersion, setSkipVersion] = useState<string | null>(null);
  const busyRef = useRef(false);
  const installingRef = useRef(false);
  const bootedRef = useRef(false);
  const statusRef = useRef<GateStatus>("idle");
  statusRef.current = status;

  const run = useCallback(async (manual = false) => {
    if (!isNativeShell() || busyRef.current || installingRef.current) return;
    busyRef.current = true;

    let bundleVersion = "";

    try {
      await nativeShellReady;
      if (!bootedRef.current) {
        bootedRef.current = true;
        await new Promise((r) => window.setTimeout(r, BOOT_SETTLE_MS));
      }

      const [{ CapacitorUpdater }, { App }] = await Promise.all([
        import("@capgo/capacitor-updater"),
        import("@capacitor/app"),
      ]);

      const manifest = await fetchMobileLatestManifest();
      setRemote(manifest);
      if (!manifest) return;

      bundleVersion = otaBundleVersion(manifest);
      setSkipVersion(bundleVersion);

      const info = await App.getInfo();
      const nativeVersion = String(info.version || bundledAppVersion()).trim();
      setNativeVersionLabel(nativeVersion);

      if (needsNativeRedownload(nativeVersion, manifest)) {
        setNativeBlock(true);
        setStatus("blocked");
        setMessage(
          manifest.message ??
            "Sorry, you need to redownload the app to update.",
        );
        return;
      }
      setNativeBlock(false);

      let currentWeb = bundledAppVersion();
      try {
        const cur = await CapacitorUpdater.current();
        currentWeb = String(cur?.bundle?.version || currentWeb).trim();
      } catch {
        /* use bundled */
      }

      if (!needsWebUpdate(currentWeb, manifest)) {
        clearMobileOtaFailure();
        markMobileOtaApplied(otaChecksumSuffix(manifest.checksum));
        setStatus("idle");
        return;
      }

      if (!manual && !shouldAutoInstallMobileOta(bundleVersion)) {
        /* User skipped or we recently failed — play on builtin, don't re-block. */
        setStatus("idle");
        return;
      }

      if (manual) {
        clearMobileOtaSkip();
        clearMobileOtaFailure();
      }

      installingRef.current = true;
      setStatus("updating");
      setMessage("Updating");
      setProgress(null);

      const progressRef = { value: null as number | null, at: Date.now() };

      const handle = await CapacitorUpdater.addListener(
        "download",
        (state: { percent?: number }) => {
          if (typeof state.percent === "number") {
            const next = Math.min(100, Math.max(0, state.percent));
            if (progressRef.value !== next) {
              progressRef.value = next;
              progressRef.at = Date.now();
            }
            setProgress(next);
          }
        },
      );
      const failHandle = await CapacitorUpdater.addListener(
        "downloadFailed",
        (state: { version?: string }) => {
          console.warn("Mobile OTA downloadFailed", state);
          setProgress(null);
        },
      );

      let bundleId: string | null = null;
      try {
        const useManifest = Boolean(manifest.manifest?.length);
        /* Capgo requires a non-empty url even for manifest deltas (iOS rejects ""). */
        const manifestUrl =
          manifest.manifest?.[0]?.download_url ??
          "https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/mobile-latest.json";
        const downloadOpts = {
          version: bundleVersion,
          url: useManifest ? manifestUrl : manifest.url,
          ...(useManifest
            ? { manifest: manifest.manifest }
            : manifest.checksum
              ? { checksum: manifest.checksum }
              : {}),
        };

        try {
          const bundle = await watchOtaDownload(
            CapacitorUpdater.download(downloadOpts),
            () => setMessage("Still downloading… keep the app open on Wi‑Fi"),
            progressRef,
          );
          bundleId = bundle.id;
        } catch (downloadErr) {
          if (useManifest) throw downloadErr;
          console.warn("Mobile update download retry", downloadErr);
          const bundle = await watchOtaDownload(
            CapacitorUpdater.download({
              version: bundleVersion,
              url: manifest.url,
            }),
            () => setMessage("Still downloading… keep the app open on Wi‑Fi"),
            progressRef,
          );
          bundleId = bundle.id;
        }

        setProgress(100);
        await CapacitorUpdater.notifyAppReady();
        markMobileOtaApplied(otaChecksumSuffix(manifest.checksum));
        await CapacitorUpdater.set({ id: bundleId! });
        clearMobileOtaFailure();
        /* set() reloads the WebView — may not return */
      } finally {
        try {
          await handle.remove();
        } catch {
          /* ignore */
        }
        try {
          await failHandle.remove();
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.warn("Mobile update failed", err);
      installingRef.current = false;
      if (bundleVersion) recordMobileOtaFailure(bundleVersion);
      setStatus("blocked");
      setMessage(
        "Could not finish the update. Redownload the app, retry when you have a better connection, or continue on the current version.",
      );
    } finally {
      busyRef.current = false;
    }
  }, []);

  const continueWithoutUpdate = useCallback(() => {
    if (skipVersion) skipMobileOta(skipVersion);
    installingRef.current = false;
    setStatus("idle");
    setProgress(null);
  }, [skipVersion]);

  useEffect(() => {
    if (!isNativeShell()) return;
    void run();
    const id = window.setInterval(() => {
      if (statusRef.current === "blocked") return;
      void run();
    }, RECHECK_MS);
    const onWake = () => {
      if (
        document.visibilityState === "visible" &&
        statusRef.current !== "blocked"
      ) {
        void run();
      }
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [run]);

  if (!isNativeShell() || status === "idle") return null;

  return (
    <div className="desktop-online-gate" role="alertdialog" aria-modal="true">
      <div className="desktop-online-gate__card">
        <h1>{status === "updating" ? "Updating" : "Update required"}</h1>
        {status === "updating" ? (
          <>
            {message !== "Updating" ? <p>{message}</p> : null}
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
          </>
        ) : (
          <>
            <p>{message}</p>
            <div className="desktop-online-gate__actions">
              <ExternalLink href={MOBILE_APK_URL} className="btn btn--primary">
                Download Android
              </ExternalLink>
              <ExternalLink href={MOBILE_IPA_URL} className="btn btn--primary">
                Download iOS
              </ExternalLink>
              <button type="button" className="btn" onClick={() => void run(true)}>
                Retry
              </button>
              {!nativeBlock ? (
                <button
                  type="button"
                  className="btn"
                  onClick={continueWithoutUpdate}
                >
                  Continue without updating
                </button>
              ) : null}
            </div>
            {remote?.version ? (
              <p className="desktop-online-gate__meta">
                Latest: {remote.version}
                {nativeVersionLabel ? ` · app ${nativeVersionLabel}` : ""}
                {remote.minNativeVersion
                  ? ` · needs app ${remote.minNativeVersion}+`
                  : ""}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
