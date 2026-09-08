import { useCallback, useEffect, useState } from "react";
import { assertOnlineBackend, isDesktopShell } from "../lib/desktopOnline";

/** Only covers desktop when the machine is offline. A failed API ping must not hide updates. */
export function DesktopOnlineGate() {
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("Checking connection…");

  const check = useCallback(async () => {
    if (!isDesktopShell()) return;
    // Only lock the app when the machine is actually offline. A slow or
    // blocked health ping must not sit on top of the updater.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setBlocked(true);
      setMessage("No internet connection.");
      return;
    }
    const result = await assertOnlineBackend(8000);
    if (result === true) {
      setBlocked(false);
      setMessage("");
      return;
    }
    setBlocked(false);
    setMessage("");
  }, []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    void check();
    const onOffline = () => {
      void check();
    };
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [check]);

  if (!blocked) return null;

  return (
    <div className="desktop-online-gate" role="alertdialog" aria-modal="true">
      <div className="desktop-online-gate__card">
        <h1>Internet required</h1>
        <p>{message}</p>
        <button type="button" className="btn btn--primary" onClick={() => void check()}>
          Retry
        </button>
      </div>
    </div>
  );
}
