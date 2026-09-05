import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { GamePath } from "../lib/routes";
import { gamesPath } from "../lib/routes";
import {
  FARM_SPAM_LOCK_MS,
  FARM_STREAK_COOL_MS,
  farmGameLabel,
  fetchGameFarm,
  flagGameSpam,
  formatSpamClock,
  rememberGameMute,
  spamUnlockMs,
  type GameFarmSnapshot,
} from "../lib/gameFarm";

type FarmCtx = {
  game: GamePath;
  snap: GameFarmSnapshot;
  canPay: boolean;
  /** Sync read — true immediately after reportInstantSpam (before re-render). */
  isMutedNow: () => boolean;
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

function emptyLocal(game: GamePath): GameFarmSnapshot {
  return {
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
  /** Wall-clock ms when local mute ends (spam or streak). Survives bad RPC replies. */
  const muteUntilRef = useRef(0);

  const refresh = useCallback(() => {
    void fetchGameFarm(game).then((next) => {
      const serverWait = spamUnlockMs(next, game);
      if (serverWait > 0) {
        muteUntilRef.current = Math.max(
          muteUntilRef.current,
          Date.now() + serverWait,
        );
      }
      setSnap(next);
    });
  }, [game]);

  useEffect(() => {
    setDismissed(false);
    muteUntilRef.current = 0;
    refresh();
  }, [game, refresh]);

  const localWait = () => Math.max(0, muteUntilRef.current - Date.now());

  const isMutedNow = useCallback(() => {
    if (localWait() > 0) return true;
    if (!snap) return false;
    return spamUnlockMs(snap, game) > 0;
  }, [game, snap]);

  const armMute = useCallback(
    (ms: number, reason: "spam" | "paused") => {
      const untilMs = Date.now() + ms;
      muteUntilRef.current = Math.max(muteUntilRef.current, untilMs);
      rememberGameMute(game, muteUntilRef.current);
      const until = new Date(muteUntilRef.current).toISOString();
      setDismissed(false);
      setSnap((prev) => {
        const base = prev ?? emptyLocal(game);
        return {
          ...base,
          canPay: false,
          reason,
          justPaused: reason === "paused",
          spamUntil: { ...base.spamUntil, [game]: until },
        };
      });
    },
    [game],
  );

  const reportInstantSpam = useCallback(() => {
    armMute(FARM_SPAM_LOCK_MS, "spam");
    void flagGameSpam(game).then((server) => {
      const serverWait = spamUnlockMs(server, game);
      if (serverWait > 0) {
        muteUntilRef.current = Math.max(
          muteUntilRef.current,
          Date.now() + serverWait,
        );
        setSnap(server);
        return;
      }
      // Keep the local 20‑minute mute if the server reply didn't include a timer.
      setSnap((prev) => {
        if (prev && spamUnlockMs(prev, game) > 0) return prev;
        const until = new Date(muteUntilRef.current).toISOString();
        return {
          ...(server.coins != null ? server : emptyLocal(game)),
          canPay: false,
          reason: "spam",
          spamUntil: { [game]: until },
        };
      });
    });
  }, [armMute, game]);

  const applyExternal = useCallback(
    (next: GameFarmSnapshot) => {
      const serverWait = spamUnlockMs(next, game);
      if (serverWait > 0) {
        muteUntilRef.current = Math.max(
          muteUntilRef.current,
          Date.now() + serverWait,
        );
      } else if (next.justPaused) {
        // Streak cool-off from note_game_run — arm 2 min if server omitted parseable until.
        armMute(FARM_STREAK_COOL_MS, "paused");
        return;
      }
      setSnap(next);
      if (serverWait > 0 || next.justPaused || next.reason === "spam") {
        setDismissed(false);
      }
    },
    [armMute, game],
  );

  const snapWait = snap ? spamUnlockMs(snap, game) : 0;
  const waitNow = Math.max(snapWait, localWait());
  useNow(waitNow > 0);
  const muted = waitNow > 0;
  const canPay = !muted;
  const coolReason = snap?.reason === "paused" ? "paused" : "spam";

  useEffect(() => {
    if (waitNow > 0) return;
    if (muteUntilRef.current > 0 && muteUntilRef.current <= Date.now()) {
      muteUntilRef.current = 0;
      refresh();
    }
  }, [refresh, waitNow]);

  const value = useMemo<FarmCtx>(() => {
    const base = snap ?? emptyLocal(game);
    return {
      game,
      snap: {
        ...base,
        canPay,
        reason: muted ? coolReason : "ok",
      },
      canPay,
      isMutedNow,
      reportInstantSpam,
      refresh,
    };
  }, [
    canPay,
    coolReason,
    game,
    isMutedNow,
    muted,
    refresh,
    reportInstantSpam,
    snap,
  ]);

  useEffect(() => {
    const onFarm = (e: Event) => {
      const detail = (e as CustomEvent<GameFarmSnapshot>).detail;
      if (!detail) return;
      if (detail.game === game || detail.spamUntil[game] || detail.justPaused) {
        applyExternal(detail);
      }
    };
    window.addEventListener("monkeycards:game-farm", onFarm);
    return () => window.removeEventListener("monkeycards:game-farm", onFarm);
  }, [applyExternal, game]);

  const label = farmGameLabel(game);
  const clock = formatSpamClock(waitNow);

  return (
    <Ctx.Provider value={value}>
      {muted ? (
        <div className="game-farm-banner" role="status">
          You can keep playing — {label} won’t pay Cash for {clock}.
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
                ? `Same game five times in a row is enough. ${label} still works, but won’t pay Cash for ${clock}.`
                : `Answers came in under 2 seconds too many times. ${label} still works, but won’t pay Cash for ${clock}.`}
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
