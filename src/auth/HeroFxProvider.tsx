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
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { heroById, heroPortraitForLevel } from "../data/heroes";
import {
  heroClearProgressFromProfile,
  heroLevelFromProfile,
  heroLevelUpReady,
  normalizeHeroClearProgress,
  normalizeHeroLevels,
  normalizeOwnedHeroIds,
} from "../lib/profileHeroes";
import {
  resolveEquippedHero,
  type EquippedHeroContext,
} from "../lib/heroEffects";
import { collectionPath } from "../lib/routes";

export type HeroProc = {
  id: number;
  heroId: string;
  message: string;
  portrait: string;
  theme?: "default" | "ice" | "fire" | "nature" | "gold";
  /** Tap opens Cards → Heroes (optionally focused on this hero). */
  openHeroes?: boolean;
};

type HeroFxValue = {
  equipped: EquippedHeroContext | null;
  notifyHeroProc: (input: {
    heroId: string;
    message: string;
    theme?: HeroProc["theme"];
    openHeroes?: boolean;
  }) => void;
};

const HeroFxContext = createContext<HeroFxValue | null>(null);

let procSeq = 0;

function themeForHero(heroId: string): HeroProc["theme"] {
  switch (heroId) {
    case "silas":
      return "ice";
    case "gwendolin":
      return "fire";
    case "obyn-greenfoot":
      return "nature";
    case "benjamin":
    case "quincy":
      return "gold";
    default:
      return "default";
  }
}

export function HeroFxProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [procs, setProcs] = useState<HeroProc[]>([]);
  const readyNotified = useRef<Set<string>>(new Set());

  const equipped = useMemo(() => {
    if (!profile) return null;
    return resolveEquippedHero({
      equipped_hero_id: profile.equipped_hero_id,
      owned_hero_ids: normalizeOwnedHeroIds(profile.owned_hero_ids),
      hero_levels: normalizeHeroLevels(profile.hero_levels),
    });
  }, [profile]);

  const notifyHeroProc = useCallback(
    (input: {
      heroId: string;
      message: string;
      theme?: HeroProc["theme"];
      openHeroes?: boolean;
    }) => {
      const hero = heroById(input.heroId);
      const level = heroLevelFromProfile(
        normalizeHeroLevels(profile?.hero_levels),
        input.heroId,
      );
      const portrait = hero
        ? heroPortraitForLevel(hero, level)
        : "/images/heroes/quincy/lvl1.webp";
      const id = ++procSeq;
      const proc: HeroProc = {
        id,
        heroId: input.heroId,
        message: input.message,
        portrait,
        theme: input.theme ?? themeForHero(input.heroId),
        openHeroes: input.openHeroes,
      };
      setProcs((list) => [...list.slice(-2), proc]);
      window.setTimeout(
        () => {
          setProcs((list) => list.filter((p) => p.id !== id));
        },
        input.openHeroes ? 5600 : 3200,
      );
    },
    [profile?.hero_levels],
  );

  // Surface persistent "ready to level" when profile shows any owned hero ready.
  useEffect(() => {
    if (!profile) return;
    const owned = normalizeOwnedHeroIds(profile.owned_hero_ids);
    const levels = normalizeHeroLevels(profile.hero_levels);
    const clears = normalizeHeroClearProgress(profile.hero_clear_progress);
    for (const id of owned) {
      const level = heroLevelFromProfile(levels, id);
      const progress = heroClearProgressFromProfile(clears, id);
      const key = `${id}@${level}`;
      if (!heroLevelUpReady(level, progress)) {
        readyNotified.current.delete(key);
        continue;
      }
      if (readyNotified.current.has(key)) continue;
      readyNotified.current.add(key);
      const name = heroById(id)?.name ?? "Hero";
      notifyHeroProc({
        heroId: id,
        message: `${name}: ready to level up — tap`,
        openHeroes: true,
      });
      break;
    }
  }, [
    profile?.owned_hero_ids,
    profile?.hero_levels,
    profile?.hero_clear_progress,
    notifyHeroProc,
  ]);

  const openHeroesFor = useCallback(
    (heroId: string) => {
      navigate(collectionPath(), {
        state: { heroes: true, heroId },
      });
    },
    [navigate],
  );

  const value = useMemo(
    () => ({ equipped, notifyHeroProc }),
    [equipped, notifyHeroProc],
  );

  return (
    <HeroFxContext.Provider value={value}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div className="hero-proc-stack" aria-live="polite">
              {procs.map((p) =>
                p.openHeroes ? (
                  <button
                    key={p.id}
                    type="button"
                    className={`hero-proc hero-proc--${p.theme ?? "default"} hero-proc--action`}
                    onClick={() => {
                      setProcs((list) => list.filter((x) => x.id !== p.id));
                      openHeroesFor(p.heroId);
                    }}
                  >
                    <img src={p.portrait} alt="" className="hero-proc__img" />
                    <p className="hero-proc__msg">{p.message}</p>
                  </button>
                ) : (
                  <div
                    key={p.id}
                    className={`hero-proc hero-proc--${p.theme ?? "default"}`}
                  >
                    <img src={p.portrait} alt="" className="hero-proc__img" />
                    <p className="hero-proc__msg">{p.message}</p>
                  </div>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </HeroFxContext.Provider>
  );
}

export function useHeroFx(): HeroFxValue {
  const ctx = useContext(HeroFxContext);
  if (!ctx) {
    return {
      equipped: null,
      notifyHeroProc: () => {},
    };
  }
  return ctx;
}
