import { useEffect, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollectionOptional } from "../auth/CardCollectionProvider";
import { cardSpecById } from "../lib/cardCatalog";
import {
  getMobileViewId,
  showsMobileAppNav,
  subscribeMobileView,
  type MobileViewId,
} from "../lib/mobileView";
import { isNativeShell } from "../lib/nativeShell";
import {
  getTradeInboxUiSnapshot,
  setTradeInboxUiOpen,
  subscribeTradeInboxUi,
} from "../lib/tradeInboxUi";
import { avatarFromProfile } from "../lib/profileAvatar";
import { UserAvatar } from "./UserAvatar";

const NAV = [
  { to: "/games", label: "Games", icon: IconGames },
  { to: "/shop", label: "Shop", icon: IconShop },
  { to: "/collection", label: "Cards", icon: IconCards },
  { to: "/leaderboard", label: "Board", icon: IconBoard },
] as const;

const MOBILE_MQ = "(max-width: 820px)";

function useTradeInboxUi() {
  return useSyncExternalStore(
    subscribeTradeInboxUi,
    getTradeInboxUiSnapshot,
    getTradeInboxUiSnapshot,
  );
}

function InboxNavBadge() {
  const { badge, isHot } = useTradeInboxUi();
  if (badge <= 0) return null;

  return (
    <button
      type="button"
      className={`mobile-inbox-badge${isHot ? " is-hot" : ""}`}
      data-inbox-trigger
      aria-label={`${badge} notification${badge === 1 ? "" : "s"}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setTradeInboxUiOpen(true);
      }}
    >
      {badge > 9 ? "9+" : badge}
    </button>
  );
}

function useIsCompactViewport() {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_MQ).matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}

function useMobileView(): MobileViewId {
  const [view, setView] = useState(() => getMobileViewId());
  useEffect(() => subscribeMobileView(setView), []);
  return view;
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function IconGames() {
  return (
    <IconFrame>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </IconFrame>
  );
}

function IconShop() {
  return (
    <IconFrame>
      <path d="M5 9h14v10.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V9Z" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
    </IconFrame>
  );
}

function IconCards() {
  return (
    <IconFrame>
      <rect x="7" y="3.5" width="10" height="14" rx="1.6" />
      <path d="M5 6.5v11a1.6 1.6 0 0 0 1.6 1.6H16" />
    </IconFrame>
  );
}

function IconBoard() {
  return (
    <IconFrame>
      <path d="M5 19V10.5" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
    </IconFrame>
  );
}

function IconYou() {
  return (
    <IconFrame>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.25a6.5 6.5 0 0 1 13 0" />
    </IconFrame>
  );
}

/** Signed-in: pfp only. Signed-out: person icon + “You”. */
function YouTabIcon() {
  const { user, profile } = useAuth();
  const collection = useCardCollectionOptional();

  if (!user || !profile) {
    return <IconYou />;
  }

  const avatar = avatarFromProfile(profile);
  const avatarId = avatar?.cardId ?? null;
  const avatarSpec = avatarId ? cardSpecById(avatarId) : null;
  const avatarFace = avatarId
    ? {
        degree: avatarSpec?.isParagon
          ? (collection?.paragonOf(avatarId)?.degree ?? 1)
          : undefined,
        visualSeed: collection?.visualSeedOf(avatarId) ?? null,
      }
    : null;

  return (
    <UserAvatar
      crop={avatar}
      face={avatarFace}
      size={22}
      className="mobile-app-nav__pfp"
    />
  );
}

function YouTab() {
  const { user, profile } = useAuth();
  const signedIn = Boolean(user && profile);

  return (
    <NavLink
      to="/profile"
      aria-label={signedIn ? "Profile" : "You"}
      className={({ isActive }) =>
        `mobile-app-nav__link${signedIn ? " mobile-app-nav__link--you-pfp" : ""}${isActive ? " is-active" : ""}`
      }
    >
      <span className="mobile-app-nav__icon mobile-app-nav__icon--you">
        <YouTabIcon />
        <InboxNavBadge />
      </span>
      {!signedIn ? (
        <span className="mobile-app-nav__label">You</span>
      ) : null}
    </NavLink>
  );
}

/** Bottom tab bar for Modern mobile chrome. */
export function MobileAppNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const compact = useIsCompactViewport();
  const view = useMobileView();
  const native = isNativeShell();

  function onCardsNavClick(e: ReactMouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/collection") return;
    e.preventDefault();
    navigate("/collection", {
      replace: true,
      state: { cardsHome: Date.now() },
    });
  }

  const show =
    native ||
    (compact && view === "modern" && showsMobileAppNav(pathname));
  if (!show) return null;

  return (
    <nav className="mobile-app-nav" aria-label="Main">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/collection"}
            onClick={item.to === "/collection" ? onCardsNavClick : undefined}
            className={({ isActive }) =>
              `mobile-app-nav__link${isActive ? " is-active" : ""}`
            }
          >
            <span className="mobile-app-nav__icon">
              <Icon />
            </span>
            <span className="mobile-app-nav__label">{item.label}</span>
          </NavLink>
        );
      })}
      <YouTab />
    </nav>
  );
}

export { useIsCompactViewport, useMobileView };
