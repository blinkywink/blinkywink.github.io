import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { GamePath } from "../lib/routes";
import { gamesPath } from "../lib/routes";
import {
  farmGameLabel,
  fetchGameFarm,
  flagGameSpam,
  formatSpamClock,
  spamUnlockMs,
  type GameFarmSnapshot,
} from "../lib/gameFarm";

type FarmCtx = {
  game: GamePath;
  snap: GameFarmSnapshot;
  canPay: boolean;
  reportInstantSpam: () => void;
  refresh: () => void;
};

const Ctx = createContext<FarmCtx | null>(null);

export function useGameFarm(): FarmCtx | null {
  return useContext(Ctx);
}

function useNow(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [active]);
}

export function GameFarmGate({
  game,
  children,
}: {
  game: GamePath;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<GameFarmSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(() => {
    void fetchGameFarm(game).then(setSnap);
  }, [game]);

  useEffect(() => {
    setDismissed(false);
    refresh();
  }, [game, refresh]);

  const reportInstantSpam = useCallback(() => {
    setDismissed(false);
    void flagGameSpam(game).then(setSnap);
  }, [game]);

  const applyExternal = useCallback((next: GameFarmSnapshot) => {
    setSnap(next);
    if (next.justPaused || next.reason === "spam" || next.reason === "paused") {
      setDismissed(false);
    }
  }, []);

  const wait = snap ? spamUnlockMs(snap, game) : 0;
  useNow(wait > 0);
  const waitNow = snap ? spamUnlockMs(snap, game) : 0;
  const muted = waitNow > 0;
  const canPay = !muted;
  const coolReason = snap?.reason === "paused" ? "paused" : "spam";

  useEffect(() => {
    if (snap && waitNow <= 0 && !snap.canPay) refresh();
  }, [refresh, snap, waitNow]);

  const value = useMemo<FarmCtx>(() => {
    const base: GameFarmSnapshot = snap ?? {
      coins: null,
      paid: 0,
      canPay: true,
      reason: "ok",
      justPaused: false,
      game,
      have: 0,
      need: 0,
      paused: {},
      spamUntil: {},
      lastGame: null,
      streak: 0,
    };
    return {
      game,
      snap: {
        ...base,
        canPay,
        reason: muted ? coolReason : "ok",
      },
      canPay,
      reportInstantSpam,
      refresh,
    };
  }, [canPay, coolReason, game, muted, refresh, reportInstantSpam, snap]);

  useEffect(() => {
    const onFarm = (e: Event) => {
      const detail = (e as CustomEvent<GameFarmSnapshot>).detail;
      if (!detail) return;
      if (detail.game === game || detail.spamUntil[game]) applyExternal(detail);
    };
    window.addEventListener("monkeycards:game-farm", onFarm);
    return () => window.removeEventListener("monkeycards:game-farm", onFarm);
  }, [applyExternal, game]);

  const label = farmGameLabel(game);

  return (
    <Ctx.Provider value={value}>
      {muted ? (
        <div className="game-farm-banner" role="status">
          You can keep playing — {label} won’t pay Cash for{" "}
          {formatSpamClock(waitNow)}.
        </div>
      ) : null}
      {children}
      {muted && !dismissed ? (
        <div
          className="game-farm-overlay game-farm-overlay--pause"
          role="dialog"
          aria-modal="true"
        >
          <div className="game-farm-overlay__panel">
            <p className="eyebrow">
              {coolReason === "paused" ? "Mix it up" : "Slow down"}
            </p>
            <h2>You can keep playing — no Cash for now</h2>
            <p>
              {coolReason === "paused"
                ? `Same game five times in a row is enough. ${label} still works, but questions won’t pay Cash for ${formatSpamClock(waitNow)}.`
                : `Those answers came in too fast. ${label} still works, but questions won’t pay Cash until the timer hits zero (${formatSpamClock(waitNow)}).`}
            </p>
            <div className="game-farm-overlay__row">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDismissed(true)}
              >
                Keep playing
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => navigate(gamesPath())}
              >
                Play other games
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
