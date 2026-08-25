import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { towerEntities } from "../data/towers";
import type { TowerEntity } from "../data/types";
import { fetchPlayerCardCopies } from "../lib/awardCards";
import { fetchPlayerParagons } from "../lib/paragonApi";
import type { ParagonMap } from "../lib/guestParagons";
import type { AvatarCrop } from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";
import {
  ALL_TOWER_SPECS,
  TOWER_CHOICES,
  TOWER_SPECS,
} from "../lib/towerCollection";
import {
  formatPathLevels,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import { needsVisualSeed } from "../lib/cardVisualSeed";
import { requestExchange } from "../lib/exchanges";
import { fetchLeaderboardRank } from "../lib/leaderboardRanks";
import { pingInbox, requestTrade } from "../lib/trades";
import {
  hasPlayerChrome,
  playerChromeStyle,
} from "../lib/profileCosmetics";
import { accountStatsPath, userAccountStatsPath } from "../lib/routes";
import { playCardFocus, preloadPackSounds } from "../lib/packSounds";
import { EquippedHeroPanel } from "./HeroCollectionStrip";
import { HeroesLab, RemoteHeroesBrowse } from "./HeroesLab";
import { MonkeyCard } from "./MonkeyCard";
import { TierSortButton } from "./TierSortButton";
import { VisibleCardGrid } from "./VisibleCardGrid";
import { ExchangeCompare } from "./ExchangeCompare";
import { OwnedCardPicker } from "./OwnedCardPicker";
import { ParagonXpBar } from "./ParagonXpBar";
import { LoadingDots } from "./LoadingDots";
import { PlayerBadges } from "./PlayerBadges";
import { UserAvatar } from "./UserAvatar";
import {
  normalizeOwnedHeroIds,
  shoppableHeroes,
} from "../lib/profileHeroes";

export type CardsOpenOpts = {
  /** Jump straight into a tower page after opening a tower pack. */
  tower?: string;
  /** Soft-highlight these card ids (recent pulls). */
  highlightIds?: string[];
  /** Open the Heroes manage / upgrade screen. */
  heroes?: boolean;
  /** Optional hero to focus when opening Heroes. */
  heroId?: string;
};

export type CollectionViewer = {
  userId: string;
  username: string;
  avatar?: AvatarCrop | null;
  showcaseCardIds?: string[];
  accentColor?: string | null;
  ownedHeroIds?: string[];
  equippedHeroId?: string | null;
  heroLevels?: Record<string, number>;
  badgeIds?: string[];
};

export type ViewerCollection = {
  ownedIds: readonly string[];
  seeds: Record<string, number>;
  paragons: ParagonMap;
  rank: number | null;
};

type Props = {
  onBack?: () => void;
  initial?: CardsOpenOpts | null;
  /** When set, show this player's collection (read-only) instead of yours. */
  viewer?: CollectionViewer | null;
  /** Prefetched collection so the first paint is complete. */
  viewerCollection?: ViewerCollection | null;
};

type View =
  | { kind: "towers" }
  | { kind: "heroes" }
  | { kind: "all" }
  | { kind: "tower"; name: string };

function baseEntity(tower: string): TowerEntity | null {
  return (
    towerEntities.find((e) => e.tower === tower && e.type === "tower") ?? null
  );
}

function matchesCardQuery(card: MonkeyCardSpec, q: string): boolean {
  if (!q) return true;
  const hay = [
    card.entity.name,
    card.tower,
    formatPathLevels(card.pathLevels),
    card.id,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/** Player collection - owned cards in color, missing ones greyed out. */
export function CardLab({
  initial,
  viewer = null,
  viewerCollection = null,
}: Props) {
  const location = useLocation();
  const { user, isGuest, profile } = useAuth();
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  /** After pick - review You vs Them before sending. */
  const [exchangeCardId, setExchangeCardId] = useState<string | null>(null);
  const { owned: myOwned, paragonOf, visualSeedOf } = useCardCollection();
  const [remoteOwned, setRemoteOwned] = useState<ReadonlySet<string> | null>(
    () => (viewerCollection ? new Set(viewerCollection.ownedIds) : null),
  );
  const [remoteSeeds, setRemoteSeeds] = useState<Record<string, number>>(
    () => viewerCollection?.seeds ?? {},
  );
  const [remoteParagons, setRemoteParagons] = useState<ParagonMap>(
    () => viewerCollection?.paragons ?? {},
  );
  const [remoteLoading, setRemoteLoading] = useState(
    () => Boolean(viewer) && !viewerCollection,
  );
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [viewerRank, setViewerRank] = useState<number | null>(
    () => viewerCollection?.rank ?? null,
  );
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(() =>
    initial?.heroes
      ? { kind: "heroes" }
      : initial?.tower
        ? { kind: "tower", name: initial.tower }
        : { kind: "towers" },
  );
  const [focused, setFocused] = useState<MonkeyCardSpec | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(
    () => new Set(initial?.highlightIds ?? []),
  );
  /**
   * Owned-only grids (All Cards) default high→low.
   * Full tower ladders with locked greys default low→high.
   */
  const [tierHighFirst, setTierHighFirst] = useState(
    () => !initial?.tower,
  );

  const preloadRef = useRef(viewerCollection);
  preloadRef.current = viewerCollection;

  useEffect(() => {
    if (!focused) return;
    preloadPackSounds();
  }, [focused]);

  useEffect(() => {
    if (!viewer) {
      setRemoteOwned(null);
      setRemoteParagons({});
      setRemoteSeeds({});
      setRemoteLoading(false);
      setRemoteError(null);
      setViewerRank(null);
      return;
    }
    const pre = preloadRef.current;
    if (pre) {
      setRemoteOwned(new Set(pre.ownedIds));
      setRemoteSeeds(pre.seeds);
      setRemoteParagons(pre.paragons);
      setViewerRank(pre.rank);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError(null);
    setRemoteOwned(null);
    setRemoteSeeds({});
    setView({ kind: "towers" });
    setTierHighFirst(true);
    setQuery("");
    setFocused(null);
    void Promise.all([
      fetchPlayerCardCopies(viewer.userId),
      fetchPlayerParagons(viewer.userId),
      fetchLeaderboardRank(viewer.userId),
    ])
      .then(([copies, nextParagons, rank]) => {
        if (cancelled) return;
        setRemoteOwned(new Set(copies.map((row) => row.cardId)));
        setRemoteSeeds(
          Object.fromEntries(
            copies
              .filter((row) => row.visualSeed != null)
              .map((row) => [row.cardId, row.visualSeed as number]),
          ),
        );
        setRemoteParagons(nextParagons);
        setViewerRank(rank);
        setRemoteLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRemoteError(
          err instanceof Error ? err.message : "Could not load collection.",
        );
        setRemoteOwned(new Set());
        setRemoteSeeds({});
          setRemoteParagons({});
        setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewer?.userId]);

  const owned = viewer ? (remoteOwned ?? new Set<string>()) : myOwned;
  const isRemote = Boolean(viewer);
  const cardDegree = (card: MonkeyCardSpec): number | undefined => {
    if (!card.isParagon) return undefined;
    if (isRemote) return remoteParagons[card.id]?.degree ?? 1;
    return paragonOf(card.id)?.degree ?? 1;
  };
  const cardSeed = (card: MonkeyCardSpec): number | undefined => {
    if (!isRemote) return undefined;
    return remoteSeeds[card.id];
  };

  const ownerLabel = viewer?.username ?? "You";
  const canRequestTrade =
    Boolean(viewer) &&
    !isGuest &&
    Boolean(user) &&
    user?.id !== viewer?.userId;

  const chromeStyle = useMemo(
    () =>
      playerChromeStyle({
        accentColor: isRemote
          ? viewer?.accentColor
          : (profile?.accent_color ?? null),
      }),
    [isRemote, viewer?.accentColor, profile?.accent_color],
  );
  const chromeOn = hasPlayerChrome(chromeStyle);

  // Only T5+ / paragons have unique art seeds - lower tiers are identical copies.
  const sharedOwned = useMemo(() => {
    const next = new Set<string>();
    if (!isRemote) return next;
    for (const id of myOwned) {
      if (owned.has(id) && needsVisualSeed(id)) next.add(id);
    }
    return next;
  }, [isRemote, myOwned, owned]);

  async function onRequestTrade() {
    if (!viewer || tradeBusy) return;
    setTradeBusy(true);
    setTradeMsg(null);
    try {
      await requestTrade(viewer.username);
      await pingInbox(viewer.userId).catch(() => undefined);
      setTradeMsg(`Trade request sent to ${viewer.username}.`);
    } catch (err) {
      setTradeMsg(err instanceof Error ? err.message : "Could not send request.");
    }
    setTradeBusy(false);
  }

  function closeExchange() {
    setExchangeOpen(false);
    setExchangeCardId(null);
  }

  function onPickExchangeCard(cardIds: string[]) {
    const cardId = cardIds[0];
    if (!cardId || !needsVisualSeed(cardId)) return;
    setExchangeCardId(cardId);
  }

  async function onSendExchange() {
    if (!viewer || tradeBusy || !exchangeCardId) return;
    if (!needsVisualSeed(exchangeCardId)) return;
    setTradeBusy(true);
    setTradeMsg(null);
    try {
      await requestExchange(viewer.username, exchangeCardId);
      await pingInbox(viewer.userId).catch(() => undefined);
      closeExchange();
      setTradeMsg(`Exchange request sent to ${viewer.username}.`);
    } catch (err) {
      setTradeMsg(err instanceof Error ? err.message : "Could not send exchange.");
    }
    setTradeBusy(false);
  }

  useEffect(() => {
    if (!initial || isRemote) return;
    if (initial.heroes) {
      setView({ kind: "heroes" });
      return;
    }
    if (initial.tower) {
      setView({ kind: "tower", name: initial.tower });
      setTierHighFirst(false);
    }
    if (initial.highlightIds?.length) {
      setHighlightIds(new Set(initial.highlightIds));
    }
  }, [initial, isRemote]);

  const cardsHomeAt =
    typeof (location.state as { cardsHome?: unknown } | null)?.cardsHome ===
    "number"
      ? (location.state as { cardsHome: number }).cardsHome
      : 0;

  useEffect(() => {
    if (!cardsHomeAt || isRemote) return;
    setFocused(null);
    setQuery("");
    setView({ kind: "towers" });
  }, [cardsHomeAt, isRemote]);

  useEffect(() => {
    if (highlightIds.size === 0) return;
    const id = window.setTimeout(() => setHighlightIds(new Set()), 8000);
    return () => window.clearTimeout(id);
  }, [highlightIds]);

  const totalOwned = owned.size;
  const totalCards = ALL_TOWER_SPECS.length;
  const ownedHeroCount = useMemo(
    () =>
      normalizeOwnedHeroIds(
        isRemote ? viewer?.ownedHeroIds : profile?.owned_hero_ids,
      ).length,
    [isRemote, viewer?.ownedHeroIds, profile?.owned_hero_ids],
  );
  const totalHeroes = useMemo(() => shoppableHeroes().length, []);
  const showcaseCards = useMemo(() => {
    const ids = viewer?.showcaseCardIds ?? [];
    return ids
      .map((id) => cardSpecById(id))
      .filter((c): c is MonkeyCardSpec => {
        if (!c) return false;
        if (viewer && remoteOwned == null) return true;
        return owned.has(c.id);
      });
  }, [viewer?.showcaseCardIds, owned, viewer, remoteOwned]);

  const filteredTowers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOWER_CHOICES;
    return TOWER_CHOICES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [query]);

  const ownedAllCards = useMemo(() => {
    let list = ALL_TOWER_SPECS.filter((c) => owned.has(c.id));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => matchesCardQuery(c, q));
    if (tierHighFirst) {
      list = list.slice().sort((a, b) => sortCardSpecs(b, a));
    }
    return list;
  }, [owned, query, tierHighFirst]);

  const towerCards = useMemo(() => {
    if (view.kind !== "tower") return [];
    const base = TOWER_SPECS[view.name] ?? [];
    if (!tierHighFirst) return base;
    return base.slice().sort((a, b) => sortCardSpecs(b, a));
  }, [view, tierHighFirst]);

  const sortToggle = (
    <TierSortButton
      highFirst={tierHighFirst}
      onToggle={() => setTierHighFirst((v) => !v)}
    />
  );

  const ownedInTower = useMemo(
    () => towerCards.reduce((n, c) => n + (owned.has(c.id) ? 1 : 0), 0),
    [towerCards, owned],
  );

  const selectedMeta = useMemo(() => {
    if (view.kind !== "tower") return null;
    return TOWER_CHOICES.find((t) => t.name === view.name) ?? null;
  }, [view]);

  useEffect(() => {
    if (!focused && !exchangeOpen && view.kind === "towers") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (exchangeCardId) setExchangeCardId(null);
      else if (exchangeOpen) closeExchange();
      else if (focused) setFocused(null);
      else if (view.kind !== "towers") {
        setQuery("");
        setView({ kind: "towers" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exchangeCardId, exchangeOpen, focused, view.kind]);

  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [focused]);

  // Fresh view = top of page (don't keep tower-list scroll).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const focusPortal = focused
    ? createPortal(
        <div
          className="card-focus"
          role="dialog"
          aria-modal="true"
          aria-label={focused.entity.name}
        >
          <button
            type="button"
            className="card-focus__backdrop"
            aria-label="Close"
            onClick={() => setFocused(null)}
          />
          <div className="card-focus__panel">
            <div className="card-focus__face">
              <button
                type="button"
                className="btn btn--ghost btn--sm card-focus__close"
                aria-label="Close"
                onClick={() => setFocused(null)}
              >
                ✕
              </button>
              <MonkeyCard
                entity={focused.entity}
                pathLevels={focused.pathLevels}
                mode="focus"
                owned
                degree={cardDegree(focused)}
                visualSeed={cardSeed(focused)}
              />
            </div>
            {focused.isParagon ? (
              <ParagonXpBar
                degree={
                  isRemote
                    ? (remoteParagons[focused.id]?.degree ?? 1)
                    : (paragonOf(focused.id)?.degree ?? 1)
                }
                xp={
                  isRemote
                    ? (remoteParagons[focused.id]?.xp ?? 0)
                    : (paragonOf(focused.id)?.xp ?? 0)
                }
              />
            ) : null}
          </div>
        </div>,
        document.body,
      )
    : null;

  const exchangePortal =
    exchangeOpen && viewer
      ? createPortal(
          <div
            className="card-lab__exchange"
            role="dialog"
            aria-modal="true"
            aria-label={`Exchange a card with ${viewer.username}`}
          >
            <button
              type="button"
              className="card-lab__exchange-backdrop"
              aria-label="Close"
              onClick={closeExchange}
            />
            <div className="card-lab__exchange-panel">
              <div className="card-lab__exchange-head">
                <div>
                  <p className="eyebrow">Exchange</p>
                  <h2>
                    {exchangeCardId
                      ? `Compare with ${viewer.username}`
                      : `Swap a copy with ${viewer.username}`}
                  </h2>
                  <p>
                    {exchangeCardId
                      ? "Check art seed and degree differences, then send the request. They’ll name a Cash fee - you accept or decline."
                      : "Only Tier 5+ cards and paragons are unique - pick one you both own. You’ll compare copies before sending."}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm desktop-only-close"
                  aria-label="Close"
                  onClick={closeExchange}
                >
                  ✕
                </button>
              </div>
              {sharedOwned.size === 0 ? (
                <p className="card-lab__exchange-empty">
                  You don’t share any Tier 5+ or paragon cards with{" "}
                  {viewer.username} yet.
                </p>
              ) : exchangeCardId ? (
                <div className="card-lab__exchange-review">
                  <ExchangeCompare
                    cardId={exchangeCardId}
                    mine={{
                      label: "You",
                      seed: visualSeedOf(exchangeCardId),
                      degree: paragonOf(exchangeCardId)?.degree,
                      xp: paragonOf(exchangeCardId)?.xp,
                    }}
                    theirs={{
                      label: viewer.username,
                      seed: remoteSeeds[exchangeCardId] ?? null,
                      degree: remoteParagons[exchangeCardId]?.degree,
                      xp: remoteParagons[exchangeCardId]?.xp,
                    }}
                  />
                  <div className="card-lab__exchange-actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={tradeBusy}
                      onClick={() => setExchangeCardId(null)}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={tradeBusy}
                      onClick={() => void onSendExchange()}
                    >
                      {tradeBusy ? "Sending…" : "Send exchange"}
                    </button>
                  </div>
                </div>
              ) : (
                <OwnedCardPicker
                  owned={sharedOwned}
                  selectedIds={new Set()}
                  onConfirm={onPickExchangeCard}
                  confirmLabel="Compare copies"
                  multi={false}
                  maxSelected={1}
                  disabled={tradeBusy}
                />
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  // --- Tower picker ---
  if (view.kind === "towers") {
    if (isRemote && remoteLoading) {
      return (
        <div className="card-lab">
          <LoadingDots label="Loading collection" className="card-lab__loading" />
        </div>
      );
    }

    return (
      <div
        className={`card-lab${chromeOn ? " has-player-chrome" : ""}`}
        style={chromeOn ? chromeStyle : undefined}
      >
        {isRemote ? (
        <header className="card-lab__header card-lab__header--remote">
          <div className="card-lab__titles">
            <h1 className="card-lab__title-row">
              {viewer?.avatar ? (
                <UserAvatar
                  crop={viewer.avatar}
                  face={
                    viewer.avatar.cardId
                      ? {
                          degree: remoteParagons[viewer.avatar.cardId]?.degree,
                          visualSeed:
                            remoteSeeds[viewer.avatar.cardId] ?? null,
                        }
                      : null
                  }
                  size={56}
                  alt=""
                  className="card-lab__avatar"
                />
              ) : null}
              {`${ownerLabel}'s Cards`}
            </h1>
            <PlayerBadges
              rank={viewerRank}
              badgeIds={viewer?.badgeIds}
              size="sm"
            />
            {!remoteError ? (
              <>
                {showcaseCards.length > 0 ? (
                  <div className="player-showcase">
                    <div className="player-showcase__row">
                      {showcaseCards.map((card) => (
                        <MonkeyCard
                          key={card.id}
                          entity={card.entity}
                          pathLevels={card.pathLevels}
                          mode="preview"
                          owned
                          degree={cardDegree(card)}
                          visualSeed={cardSeed(card)}
                          onSelect={() => {
                            playCardFocus();
                            setFocused(card);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                <EquippedHeroPanel
                  equippedHeroId={viewer?.equippedHeroId}
                  heroLevels={viewer?.heroLevels}
                  size="md"
                />
              </>
            ) : null}
            {remoteError ? (
              <p className="card-lab__blurb">{remoteError}</p>
            ) : null}
            {canRequestTrade ? (
              <div className="card-lab__trade">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={tradeBusy}
                  onClick={() => void onRequestTrade()}
                >
                  {tradeBusy ? "Sending…" : "Request trade"}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={tradeBusy}
                  onClick={() => {
                    setTradeMsg(null);
                    setExchangeCardId(null);
                    setExchangeOpen(true);
                  }}
                >
                  Request exchange
                </button>
                {tradeMsg ? (
                  <p className="card-lab__trade-msg">{tradeMsg}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>
        ) : null}

        <div className="card-lab__picker">
          <button
            type="button"
            className="card-lab__all-btn"
            onClick={() => {
              setQuery("");
              setTierHighFirst(true);
              setView({ kind: "all" });
            }}
          >
            <span className="card-lab__all-btn-title">All Cards</span>
            <span className="card-lab__all-btn-meta">
              {totalOwned} / {totalCards} owned
            </span>
          </button>

          <button
            type="button"
            className="card-lab__all-btn card-lab__all-btn--heroes"
            onClick={() => {
              setQuery("");
              setView({ kind: "heroes" });
            }}
          >
            <span className="card-lab__all-btn-title">Heroes</span>
            <span className="card-lab__all-btn-meta">
              {isRemote
                ? `${ownedHeroCount} / ${totalHeroes} unlocked`
                : `${ownedHeroCount} / ${totalHeroes} unlocked · equip & level up`}
            </span>
          </button>

          <Link
            to={
              isRemote && viewer
                ? userAccountStatsPath(viewer.username)
                : accountStatsPath()
            }
            className="card-lab__all-btn card-lab__all-btn--stats"
          >
            <span className="card-lab__all-btn-title">Stats</span>
          </Link>

          <label className="card-lab__search">
            <span className="card-lab__search-label">Search towers</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Dart Monkey, Ninja, Military…"
              autoComplete="off"
            />
          </label>

          <div className="card-lab__tower-list" role="list">
            {filteredTowers.map((tower) => {
              const specs = TOWER_SPECS[tower.name] ?? [];
              const ownedN = specs.reduce(
                (n, c) => n + (owned.has(c.id) ? 1 : 0),
                0,
              );
              return (
                <button
                  key={tower.name}
                  type="button"
                  role="listitem"
                  className={`card-lab__tower-btn${ownedN >= tower.cardCount && tower.cardCount > 0 ? " is-complete" : ""}`}
                  data-category={tower.category}
                  onClick={() => {
                    setQuery("");
                    setTierHighFirst(false);
                    setView({ kind: "tower", name: tower.name });
                  }}
                >
                  <img
                    src={tower.image}
                    alt=""
                    draggable={false}
                    loading="lazy"
                  />
                  <span className="card-lab__tower-text">
                    <span className="card-lab__tower-name">{tower.name}</span>
                    <span className="card-lab__tower-meta">
                      {tower.category} · {ownedN}/{tower.cardCount} owned
                    </span>
                  </span>
                </button>
              );
            })}
            {filteredTowers.length === 0 ? (
              <p className="card-lab__hint">No towers match “{query}”.</p>
            ) : null}
          </div>
        </div>
        {focusPortal}
        {exchangePortal}
      </div>
    );
  }

  // --- Heroes manage / upgrade (or read-only browse on remote) ---
  if (view.kind === "heroes") {
    if (isRemote && viewer) {
      return (
        <RemoteHeroesBrowse
          viewer={{
            username: viewer.username,
            ownedHeroIds: viewer.ownedHeroIds,
            equippedHeroId: viewer.equippedHeroId,
            heroLevels: viewer.heroLevels,
          }}
          initialHeroId={initial?.heroId}
          onBack={() => {
            setView({ kind: "towers" });
          }}
        />
      );
    }
    return (
      <HeroesLab
        initialHeroId={initial?.heroId}
        onBack={() => {
          setView({ kind: "towers" });
        }}
      />
    );
  }

  // --- All owned cards ---
  if (view.kind === "all") {
    return (
      <div
        className={`card-lab${chromeOn ? " has-player-chrome" : ""}`}
        style={chromeOn ? chromeStyle : undefined}
      >
        {isRemote ? (
          <header className="card-lab__header">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setFocused(null);
                setQuery("");
                setView({ kind: "towers" });
              }}
            >
              ← Towers
            </button>
          </header>
        ) : null}
        <div className="card-lab__toolbar">
          <label className="card-lab__search card-lab__search--inline">
            <span className="card-lab__search-label">
              {isRemote ? "Search cards" : "Search your cards"}
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tower, upgrade name, 0-2-5…"
              autoComplete="off"
            />
          </label>
          {sortToggle}
        </div>

        {ownedAllCards.length === 0 ? (
          <p className="card-lab__hint">
            {totalOwned === 0
              ? "No cards yet."
              : `No owned cards match “${query}”.`}
          </p>
        ) : (
          <VisibleCardGrid
            items={ownedAllCards}
            getKey={(card) => card.id}
            resetKey={`${query}|${tierHighFirst ? "hi" : "lo"}|${ownedAllCards.length}`}
            renderItem={(card) => (
              <MonkeyCard
                entity={card.entity}
                pathLevels={card.pathLevels}
                mode="preview"
                richPreview
                owned
                highlight={highlightIds.has(card.id)}
                degree={cardDegree(card)}
                visualSeed={cardSeed(card)}
                onSelect={() => {
                  playCardFocus();
                  setFocused(card);
                }}
              />
            )}
          />
        )}

        {focusPortal}
        {exchangePortal}
      </div>
    );
  }

  // --- Single tower card page ---
  if (view.kind !== "tower") return null;

  const portrait = selectedMeta?.image ?? baseEntity(view.name)?.image;

  return (
    <div
      className={`card-lab${chromeOn ? " has-player-chrome" : ""}`}
      style={chromeOn ? chromeStyle : undefined}
      >
      <header className="card-lab__header">
        {isRemote ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setFocused(null);
              setView({ kind: "towers" });
            }}
          >
            ← Towers
          </button>
        ) : null}
        <div className="card-lab__titles card-lab__titles--tower">
          <p className="eyebrow">{selectedMeta?.category ?? "Tower"}</p>
          <div className="card-lab__tower-row">
            <h1 className="card-lab__tower-heading">
              {portrait ? (
                <img src={portrait} alt="" draggable={false} />
              ) : null}
              <span className="card-lab__tower-title">{view.name}</span>
              <span className="card-lab__tower-owned">
                {ownedInTower}/{towerCards.length}
              </span>
            </h1>
            {sortToggle}
          </div>
        </div>
      </header>

      <VisibleCardGrid
        items={towerCards}
        getKey={(card) => card.id}
        resetKey={`${view.name}|${tierHighFirst ? "hi" : "lo"}`}
        pageSize={36}
        renderItem={(card) => {
          const isOwned = owned.has(card.id);
          return (
            <MonkeyCard
              entity={card.entity}
              pathLevels={card.pathLevels}
              mode="preview"
              owned={isOwned}
              highlight={highlightIds.has(card.id)}
              degree={isOwned ? cardDegree(card) : undefined}
              visualSeed={isOwned ? cardSeed(card) : undefined}
              onSelect={() => {
                if (!isOwned) return;
                playCardFocus();
                setFocused(card);
              }}
            />
          );
        }}
      />

      <p className="card-lab__hint">
        {ownedInTower}/{towerCards.length} unlocked · Escape returns to tower
        list
      </p>

      {focusPortal}
      {exchangePortal}
    </div>
  );
}
