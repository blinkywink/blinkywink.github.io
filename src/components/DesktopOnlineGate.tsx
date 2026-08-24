import { useCallback, useEffect, useState } from "react";
import { assertOnlineBackend, isDesktopShell } from "../lib/desktopOnline";

/** Blocks interaction on desktop until Supabase is reachable - app shell renders underneath. */
export function DesktopOnlineGate() {
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("Checking connection…");

  const check = useCallback(async () => {
    if (!isDesktopShell()) return;
    const result = await assertOnlineBackend(3000);
    if (result === true) {
      setBlocked(false);
      setMessage("");
      return;
    }
    setBlocked(true);
    setMessage(result);
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
