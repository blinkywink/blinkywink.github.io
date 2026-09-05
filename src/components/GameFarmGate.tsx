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
  formatSpamWait,
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

export function GameFarmGate({
  game,
  children,
}: {
  game: GamePath;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<GameFarmSnapshot | null>(null);
  const [dismissedPause, setDismissedPause] = useState(false);

  const refresh = useCallback(() => {
    void fetchGameFarm(game).then(setSnap);
  }, [game]);

  useEffect(() => {
    setDismissedPause(false);
    refresh();
  }, [game, refresh]);

  const reportInstantSpam = useCallback(() => {
    void flagGameSpam(game).then(setSnap);
  }, [game]);

  const applyExternal = useCallback((next: GameFarmSnapshot) => {
    setSnap(next);
    if (next.justPaused) setDismissedPause(false);
  }, []);

  const value = useMemo<FarmCtx | null>(() => {
    if (!snap) {
      return {
        game,
        snap: {
          coins: null,
          paid: 0,
          canPay: true,
          reason: "ok",
          justPaused: false,
          game,
          have: 0,
          need: 4,
          paused: {},
          spamUntil: {},
          lastGame: null,
          streak: 0,
        },
        canPay: true,
        reportInstantSpam,
        refresh,
      };
    }
    return {
      game,
      snap,
      canPay: snap.canPay,
      reportInstantSpam,
      refresh,
    };
  }, [game, snap, reportInstantSpam, refresh]);

  useEffect(() => {
    const onFarm = (e: Event) => {
      const detail = (e as CustomEvent<GameFarmSnapshot>).detail;
      if (detail?.game === game) applyExternal(detail);
    };
    window.addEventListener("monkeycards:game-farm", onFarm);
    return () => window.removeEventListener("monkeycards:game-farm", onFarm);
  }, [applyExternal, game]);

  const spam = snap?.reason === "spam";
  const paused = snap?.reason === "paused";
  const wait = snap ? spamUnlockMs(snap, game) : 0;
  const label = farmGameLabel(game);

  return (
    <Ctx.Provider value={value}>
      {paused && !spam ? (
        <div className="game-farm-banner" role="status">
          {label} isn’t paying Cash until you win {snap?.need ?? 4} other
          games ({snap?.have ?? 0}/{snap?.need ?? 4}). You can keep playing.
        </div>
      ) : null}
      {children}
      {spam ? (
        <div className="game-farm-overlay" role="alertdialog" aria-modal="true">
          <div className="game-farm-overlay__panel">
            <p className="eyebrow">Slow down</p>
            <h2>That didn’t look like real play</h2>
            <p>
              {label} answers were coming in too fast — like auto-clicking
              through every question. This game is locked
              {wait > 0 ? ` for ${formatSpamWait(wait)}` : " for a bit"}. Play
              something else in the meantime.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate(gamesPath())}
            >
              Back to games
            </button>
          </div>
        </div>
      ) : null}
      {paused && !spam && !dismissedPause ? (
        <div className="game-farm-overlay game-farm-overlay--pause" role="dialog" aria-modal="true">
          <div className="game-farm-overlay__panel">
            <p className="eyebrow">Mix it up</p>
            <h2>{label} won’t pay Cash right now</h2>
            <p>
              Same game five times in a row is enough. Win {snap?.need ?? 4}{" "}
              different other games and {label} will pay again. You can still
              play it — just no Cash.
            </p>
            <p className="game-farm-overlay__progress">
              Other games won: {snap?.have ?? 0}/{snap?.need ?? 4}
            </p>
            <div className="game-farm-overlay__row">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDismissedPause(true)}
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
