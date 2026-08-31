import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeShell, nativeShellReady } from "../lib/nativeShell";
import {
  clearMobileOtaFailure,
  clearMobileOtaSkip,
  markMobileOtaApplied,
  nativeRedownloadSkipped,
  recordMobileOtaFailure,
  shouldAutoInstallMobileOta,
  skipMobileOta,
  skipNativeRedownload,
} from "../lib/mobileOtaGuard";
import { startVisiblePoll } from "../lib/visiblePoll";
import {
  MOBILE_APK_URL,
  MOBILE_IPA_URL,
  fetchBakedOtaChecksum,
  fetchMobileLatestManifest,
  isBuiltinWebBundle,
  needsNativeRedownload,
  needsWebUpdate,
  bundledAppVersion,
  otaBundleVersion,
  otaChecksumSuffix,
  type MobileLatestManifest,
} from "../lib/mobileUpdates";
import { ExternalLink } from "./ExternalLink";

type GateStatus = "idle" | "updating" | "blocked";
type CapgoUpdater = typeof import("@capgo/capacitor-updater").CapacitorUpdater;

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

async function notifyReady(updater: CapgoUpdater) {
  try {
    await updater.notifyAppReady();
  } catch {
    /* builtin / already ready */
  }
}

export function MobileUpdateGate() {
  const [status, setStatus] = useState<GateStatus>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [remote, setRemote] = useState<MobileLatestManifest | null>(null);
  const [nativeBlock, setNativeBlock] = useState(false);
  const [nativeVersionLabel, setNativeVersionLabel] = useState<string | null>(
    null,
  );
  const [skipVersion, setSkipVersion] = useState<string | null>(null);
  const busyRef = useRef(false);
  const installingRef = useRef(false);
  const cancelledRef = useRef(false);
  const bootedRef = useRef(false);
  const statusRef = useRef<GateStatus>("idle");
  statusRef.current = status;

  const run = useCallback(async (manual = false) => {
    if (!isNativeShell() || busyRef.current || installingRef.current) return;
    busyRef.current = true;

    let bundleVersion = "";

    const downloadAndApply = async (
      updater: CapgoUpdater,
      manifest: MobileLatestManifest,
      blocking: boolean,
    ) => {
      cancelledRef.current = false;
      installingRef.current = true;
      if (blocking) {
        setStatus("updating");
        setMessage("Updating");
        setProgress(null);
      }

      const progressRef = { value: null as number | null, at: Date.now() };

      const handle = await updater.addListener(
        "download",
        (state: { percent?: number }) => {
          if (!blocking || typeof state.percent !== "number") return;
          const next = Math.min(100, Math.max(0, state.percent));
          if (progressRef.value !== next) {
            progressRef.value = next;
            progressRef.at = Date.now();
          }
          setProgress(next);
        },
      );
      const failHandle = await updater.addListener(
        "downloadFailed",
        (state: { version?: string }) => {
          console.warn("Mobile OTA downloadFailed", state);
          if (blocking) setProgress(null);
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

        const onStall = blocking
          ? () => setMessage("Still downloading… keep the app open on Wi‑Fi")
          : () => {};

        try {
          const bundle = await watchOtaDownload(
            updater.download(downloadOpts),
            onStall,
            progressRef,
          );
          bundleId = bundle.id;
        } catch (downloadErr) {
          console.warn("Mobile update download retry", downloadErr);
          const zipUrl =
            "https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/MonkeyCards-web.zip";
          const bundle = await watchOtaDownload(
            updater.download({
              version: bundleVersion,
              url: zipUrl,
            }),
            onStall,
            progressRef,
          );
          bundleId = bundle.id;
        }

        if (cancelledRef.current) return;
        if (blocking) setProgress(100);
        await updater.notifyAppReady();
        markMobileOtaApplied(otaChecksumSuffix(manifest.checksum));
        await updater.set({ id: bundleId! });
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
    };

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
      if (!manifest) {
        await notifyReady(CapacitorUpdater);
        setStatus("idle");
        return;
      }

      bundleVersion = otaBundleVersion(manifest);
      setSkipVersion(bundleVersion);

      const info = await App.getInfo();
      const nativeVersion = String(info.version || bundledAppVersion()).trim();
      setNativeVersionLabel(nativeVersion);

      if (
        needsNativeRedownload(nativeVersion, manifest) &&
        !nativeRedownloadSkipped()
      ) {
        setMessage(
          manifest.message ??
            "Sorry, you need to redownload the app to update.",
        );
        setNativeBlock(true);
        setStatus("blocked");
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

      const baked = await fetchBakedOtaChecksum();
      if (!needsWebUpdate(currentWeb, manifest, baked)) {
        await notifyReady(CapacitorUpdater);
        clearMobileOtaFailure();
        markMobileOtaApplied(otaChecksumSuffix(manifest.checksum));
        setStatus("idle");
        return;
      }

      /* Fresh IPA/APK is Capgo "builtin". Auto-OTA copies the whole site
         (~1000 files) on device — that freeze is disk copy, not Wi‑Fi.
         Play the app that was just installed; Retry still OTAs. */
      if (!manual && isBuiltinWebBundle(currentWeb)) {
        await notifyReady(CapacitorUpdater);
        setStatus("idle");
        return;
      }

      if (!manual && !shouldAutoInstallMobileOta(bundleVersion)) {
        await notifyReady(CapacitorUpdater);
        setStatus("idle");
        return;
      }

      if (manual) {
        clearMobileOtaSkip();
        clearMobileOtaFailure();
      }

      if (!manual) {
        /* Already on a Capgo bundle: download in the background, no overlay. */
        await notifyReady(CapacitorUpdater);
        installingRef.current = true;
        setStatus("idle");
        busyRef.current = false;
        void downloadAndApply(CapacitorUpdater, manifest, false)
          .catch((err) => {
            console.warn("Background mobile OTA failed", err);
            if (bundleVersion) recordMobileOtaFailure(bundleVersion);
          })
          .finally(() => {
            installingRef.current = false;
          });
        return;
      }

      await downloadAndApply(CapacitorUpdater, manifest, true);
    } catch (err) {
      console.warn("Mobile update failed", err);
      installingRef.current = false;
      if (!manual) {
        if (bundleVersion) recordMobileOtaFailure(bundleVersion);
        setStatus("idle");
        return;
      }
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
    cancelledRef.current = true;
    if (skipVersion) skipMobileOta(skipVersion);
    skipNativeRedownload();
    installingRef.current = false;
    setNativeBlock(false);
    setStatus("idle");
    setProgress(null);
  }, [skipVersion]);

  useEffect(() => {
    if (!isNativeShell()) return;
    void run();
    return startVisiblePoll(() => {
      if (statusRef.current === "blocked") return;
      void run();
    }, RECHECK_MS);
  }, [run]);

  if (!isNativeShell() || status === "idle") return null;

  return (
    <div className="desktop-online-gate" role="alertdialog" aria-modal="true">
      <div className="desktop-online-gate__card">
        <h1>
          {status === "updating"
            ? "Updating"
            : nativeBlock
              ? "Update required"
              : "Couldn't update"}
        </h1>
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
            <div className="desktop-online-gate__actions">
              <button
                type="button"
                className="btn"
                onClick={continueWithoutUpdate}
              >
                Continue without updating
              </button>
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
              <button
                type="button"
                className="btn"
                onClick={continueWithoutUpdate}
              >
                Continue without updating
              </button>
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
