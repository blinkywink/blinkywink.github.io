import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { heroById, heroPortraitForLevel } from "../data/heroes";
import {
  heroLevelFromProfile,
  normalizeHeroLevels,
  normalizeOwnedHeroIds,
} from "../lib/profileHeroes";
import {
  resolveEquippedHero,
  type EquippedHeroContext,
} from "../lib/heroEffects";

export type HeroProc = {
  id: number;
  heroId: string;
  message: string;
  portrait: string;
  theme?: "default" | "ice" | "fire" | "nature" | "gold";
};

type HeroFxValue = {
  equipped: EquippedHeroContext | null;
  notifyHeroProc: (input: {
    heroId: string;
    message: string;
    theme?: HeroProc["theme"];
  }) => void;
};

const HeroFxContext = createContext<HeroFxValue | null>(null);

let procSeq = 0;

function themeForHero(heroId: string): HeroProc["theme"] {
  switch (heroId) {
    case "silas":
      return "ice";
    case "gwendolin":
    case "adora":
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
  const [procs, setProcs] = useState<HeroProc[]>([]);

  const equipped = useMemo(() => {
    if (!profile) return null;
    return resolveEquippedHero({
      equipped_hero_id: profile.equipped_hero_id,
      owned_hero_ids: normalizeOwnedHeroIds(profile.owned_hero_ids),
      hero_levels: normalizeHeroLevels(profile.hero_levels),
    });
  }, [profile]);

  const notifyHeroProc = useCallback(
    (input: { heroId: string; message: string; theme?: HeroProc["theme"] }) => {
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
      };
      setProcs((list) => [...list.slice(-2), proc]);
      window.setTimeout(() => {
        setProcs((list) => list.filter((p) => p.id !== id));
      }, 3200);
    },
    [profile?.hero_levels],
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
              {procs.map((p) => (
                <div
                  key={p.id}
                  className={`hero-proc hero-proc--${p.theme ?? "default"}`}
                >
                  <img src={p.portrait} alt="" className="hero-proc__img" />
                  <p className="hero-proc__msg">{p.message}</p>
                </div>
              ))}
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
