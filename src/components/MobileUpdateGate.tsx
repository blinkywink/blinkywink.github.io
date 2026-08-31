import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeShell, nativeShellReady } from "../lib/nativeShell";
import { markMobileOtaApplied } from "../lib/mobileOtaGuard";
import { startVisiblePoll } from "../lib/visiblePoll";
import {
  MOBILE_APK_URL,
  MOBILE_IPA_URL,
  fetchBakedOtaChecksum,
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
type CapgoUpdater = typeof import("@capgo/capacitor-updater").CapacitorUpdater;

const RECHECK_MS = 30_000;
const BOOT_SETTLE_MS = 1_500;
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000;

async function notifyReady(updater: CapgoUpdater) {
  try {
    await updater.notifyAppReady();
  } catch {
    /* builtin */
  }
}

async function downloadZip(
  updater: CapgoUpdater,
  manifest: MobileLatestManifest,
  onProgress: (pct: number | null) => void,
) {
  const bundleVersion = otaBundleVersion(manifest);
  const handle = await updater.addListener(
    "download",
    (state: { percent?: number }) => {
      if (typeof state.percent === "number") {
        onProgress(Math.min(100, Math.max(0, state.percent)));
      }
    },
  );

  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new Error("OTA download timed out")),
      DOWNLOAD_TIMEOUT_MS,
    );
  });

  try {
    const bundle = await Promise.race([
      updater.download({
        version: bundleVersion,
        url: manifest.url,
        checksum: manifest.checksum,
      }),
      timeout,
    ]);
    onProgress(100);
    markMobileOtaApplied(otaChecksumSuffix(manifest.checksum));
    await notifyReady(updater);
    await updater.set({ id: bundle.id });
  } finally {
    try {
      await handle.remove();
    } catch {
      /* ignore */
    }
  }
}

export function MobileUpdateGate() {
  const [status, setStatus] = useState<GateStatus>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [nativeBlock, setNativeBlock] = useState(false);
  const busyRef = useRef(false);
  const bootedRef = useRef(false);
  const nativeBlockRef = useRef(false);
  const statusRef = useRef<GateStatus>("idle");
  statusRef.current = status;
  nativeBlockRef.current = nativeBlock;

  const run = useCallback(async () => {
    if (!isNativeShell() || busyRef.current) return;
    if (statusRef.current === "updating") return;
    busyRef.current = true;

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
      if (!manifest) {
        setNativeBlock(false);
        setMessage("Could not reach the update server.");
        setStatus("blocked");
        return;
      }

      const info = await App.getInfo();
      const nativeVersion = String(info.version || bundledAppVersion()).trim();
      if (needsNativeRedownload(nativeVersion, manifest)) {
        setNativeBlock(true);
        setMessage(manifest.message ?? "Redownload the app to keep playing.");
        setStatus("blocked");
        return;
      }
      setNativeBlock(false);

      let currentWeb = bundledAppVersion();
      try {
        const cur = await CapacitorUpdater.current();
        currentWeb = String(cur?.bundle?.version || currentWeb).trim();
      } catch {
        /* builtin */
      }

      const baked = await fetchBakedOtaChecksum();
      if (!needsWebUpdate(currentWeb, manifest, baked)) {
        await notifyReady(CapacitorUpdater);
        markMobileOtaApplied(otaChecksumSuffix(manifest.checksum));
        setStatus("idle");
        return;
      }

      setStatus("updating");
      setMessage("Updating");
      setProgress(null);
      await downloadZip(CapacitorUpdater, manifest, setProgress);
    } catch (err) {
      console.warn("Mobile update failed", err);
      setNativeBlock(false);
      setStatus("blocked");
      setMessage("Could not finish the update. Check your connection and retry.");
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isNativeShell()) return;
    void run();
    return startVisiblePoll(() => {
      if (statusRef.current === "updating") return;
      if (nativeBlockRef.current) return;
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
          <>
            <p>{message}</p>
            <div className="desktop-online-gate__actions">
              {nativeBlock ? (
                <>
                  <ExternalLink href={MOBILE_APK_URL} className="btn btn--primary">
                    Download Android
                  </ExternalLink>
                  <ExternalLink href={MOBILE_IPA_URL} className="btn btn--primary">
                    Download iOS
                  </ExternalLink>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void run()}
                >
                  Retry
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
