import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { towerChoiceByName } from "../lib/towerCollection";
import { collectionPath } from "../lib/routes";

type TowerCompleteToast = {
  id: number;
  towerName: string;
  image: string;
  message: string;
};

type TowerCompleteValue = {
  notifyTowerCompletions: (towerNames: string[]) => void;
  setTowerCompleteDeferral: (deferred: boolean) => void;
};

const TowerCompleteContext = createContext<TowerCompleteValue | null>(null);

let toastSeq = 0;

export function TowerCompleteProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<TowerCompleteToast[]>([]);
  const deferRef = useRef(false);
  const pendingRef = useRef<string[]>([]);

  const pushToast = useCallback((towerName: string) => {
    const tower = towerChoiceByName(towerName);
    if (!tower) return;
    const id = ++toastSeq;
    const toast: TowerCompleteToast = {
      id,
      towerName: tower.name,
      image: tower.image,
      message: `${tower.name} complete! Tap to view`,
    };
    setToasts((list) => [...list.slice(-2), toast]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 6200);
  }, []);

  const notifyTowerCompletions = useCallback(
    (towerNames: string[]) => {
      const unique = [...new Set(towerNames.filter(Boolean))];
      if (!unique.length) return;
      if (deferRef.current) {
        pendingRef.current.push(...unique);
        return;
      }
      for (const name of unique) pushToast(name);
    },
    [pushToast],
  );

  const setTowerCompleteDeferral = useCallback(
    (deferred: boolean) => {
      deferRef.current = deferred;
      if (deferred) return;
      const pending = [...new Set(pendingRef.current)];
      pendingRef.current = [];
      for (const name of pending) pushToast(name);
    },
    [pushToast],
  );

  const openTower = useCallback(
    (towerName: string) => {
      navigate(collectionPath(), {
        state: { tower: towerName },
      });
    },
    [navigate],
  );

  const value = useMemo(
    () => ({ notifyTowerCompletions, setTowerCompleteDeferral }),
    [notifyTowerCompletions, setTowerCompleteDeferral],
  );

  return (
    <TowerCompleteContext.Provider value={value}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div className="tower-complete-stack" aria-live="polite">
              {toasts.map((toast) => (
                <button
                  key={toast.id}
                  type="button"
                  className="hero-proc hero-proc--complete hero-proc--action"
                  onClick={() => {
                    setToasts((list) => list.filter((t) => t.id !== toast.id));
                    openTower(toast.towerName);
                  }}
                >
                  <img
                    src={toast.image}
                    alt=""
                    className="hero-proc__img"
                  />
                  <p className="hero-proc__msg">{toast.message}</p>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </TowerCompleteContext.Provider>
  );
}

export function useTowerComplete(): TowerCompleteValue {
  const ctx = useContext(TowerCompleteContext);
  if (!ctx) {
    return {
      notifyTowerCompletions: () => {},
      setTowerCompleteDeferral: () => {},
    };
  }
  return ctx;
}
