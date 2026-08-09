import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { towerEntities, towers as baseTowers } from "../data/towers";
import type { TowerEntity } from "../data/types";
import { fetchPlayerCardIds } from "../lib/awardCards";
import type { AvatarCrop } from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";
import {
  buildTowerCardSpecs,
  formatPathLevels,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import { pingInbox, requestTrade } from "../lib/trades";
import { MonkeyCard } from "./MonkeyCard";
import { UserAvatar } from "./UserAvatar";

export type CardsOpenOpts = {
  /** Jump straight into a tower page after opening a tower pack. */
  tower?: string;
  /** Soft-highlight these card ids (recent pulls). */
  highlightIds?: string[];
};

export type CollectionViewer = {
  userId: string;
  username: string;
  avatar?: AvatarCrop | null;
  showcaseCardIds?: string[];
};

type Props = {
  onBack: () => void;
  initial?: CardsOpenOpts | null;
  /** When set, show this player's collection (read-only) instead of yours. */
  viewer?: CollectionViewer | null;
};

type View =
  | { kind: "towers" }
  | { kind: "all" }
  | { kind: "tower"; name: string };

const CATEGORY_ORDER = ["Primary", "Military", "Magic", "Support"];

type TowerChoice = {
  name: string;
  category: string;
  image: string;
  cardCount: number;
};

function cardCountFor(tower: string): number {
  const hasParagon = towerEntities.some(
    (e) => e.tower === tower && e.type === "paragon",
  );
  return 64 + (hasParagon ? 1 : 0);
}

const TOWER_CHOICES: TowerChoice[] = baseTowers
  .slice()
  .sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
    return a.tower.localeCompare(b.tower);
  })
  .map((t) => ({
    name: t.tower,
    category: t.category,
    image: t.image,
    cardCount: cardCountFor(t.tower),
  }));

const TOWER_SPECS: Record<string, MonkeyCardSpec[]> = Object.fromEntries(
  TOWER_CHOICES.map((t) => [
    t.name,
    buildTowerCardSpecs(t.name).slice().sort(sortCardSpecs),
  ]),
);

/** Every collectible card across all towers. */
const ALL_SPECS: MonkeyCardSpec[] = TOWER_CHOICES.flatMap(
  (t) => TOWER_SPECS[t.name] ?? [],
);

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

/** Player collection — owned cards in color, missing ones greyed out. */
export function CardLab({ onBack, initial, viewer = null }: Props) {
  const { user, isGuest } = useAuth();
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<string | null>(null);
  const { owned: myOwned } = useCardCollection();
  const [remoteOwned, setRemoteOwned] = useState<ReadonlySet<string> | null>(
    null,
  );
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(() =>
    initial?.tower ? { kind: "tower", name: initial.tower } : { kind: "towers" },
  );
  const [focused, setFocused] = useState<MonkeyCardSpec | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(
    () => new Set(initial?.highlightIds ?? []),
  );
  /** false = low tier first (default), true = high tier / paragon first */
  const [tierHighFirst, setTierHighFirst] = useState(false);

  useEffect(() => {
    if (!viewer) {
      setRemoteOwned(null);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError(null);
    setRemoteOwned(null);
    setView({ kind: "towers" });
    setQuery("");
    setFocused(null);
    void fetchPlayerCardIds(viewer.userId)
      .then((ids) => {
        if (cancelled) return;
        setRemoteOwned(new Set(ids));
        setRemoteLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRemoteError(
          err instanceof Error ? err.message : "Could not load collection.",
        );
        setRemoteOwned(new Set());
        setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewer?.userId]);

  const owned = viewer ? (remoteOwned ?? new Set<string>()) : myOwned;
  const isRemote = Boolean(viewer);
  const ownerLabel = viewer?.username ?? "You";
  const canRequestTrade =
    Boolean(viewer) &&
    !isGuest &&
    Boolean(user) &&
    user?.id !== viewer?.userId;

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

  useEffect(() => {
    if (!initial || isRemote) return;
    if (initial.tower) setView({ kind: "tower", name: initial.tower });
    if (initial.highlightIds?.length) {
      setHighlightIds(new Set(initial.highlightIds));
    }
  }, [initial, isRemote]);

  useEffect(() => {
    if (highlightIds.size === 0) return;
    const id = window.setTimeout(() => setHighlightIds(new Set()), 8000);
    return () => window.clearTimeout(id);
  }, [highlightIds]);

  const totalOwned = owned.size;
  const totalCards = ALL_SPECS.length;
  const showcaseCards = useMemo(() => {
    const ids = viewer?.showcaseCardIds ?? [];
    return ids
      .map((id) => cardSpecById(id))
      .filter((c): c is MonkeyCardSpec => Boolean(c));
  }, [viewer?.showcaseCardIds]);

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
    let list = ALL_SPECS.filter((c) => owned.has(c.id));
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
    <button
      type="button"
      className="btn btn--ghost btn--sm card-lab__sort"
      onClick={() => setTierHighFirst((v) => !v)}
      aria-pressed={tierHighFirst}
    >
      {tierHighFirst ? "Tier · high → low" : "Tier · low → high"}
    </button>
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
    if (!focused && view.kind === "towers") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (focused) setFocused(null);
      else if (view.kind !== "towers") {
        setQuery("");
        setView({ kind: "towers" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, view.kind]);

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
            <button
              type="button"
              className="btn btn--ghost btn--sm card-focus__close"
              onClick={() => setFocused(null)}
            >
              ✕ Close
            </button>
            <MonkeyCard
              entity={focused.entity}
              pathLevels={focused.pathLevels}
              mode="focus"
              owned
            />
          </div>
        </div>,
        document.body,
      )
    : null;

  // ——— Tower picker ———
  if (view.kind === "towers") {
    if (isRemote && remoteLoading) {
      return (
        <div className="card-lab">
          <div className="card-lab__atmosphere" aria-hidden="true" />
          <header className="card-lab__header">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onBack}
            >
              ← Leaderboard
            </button>
            <div className="card-lab__titles">
              <p className="eyebrow">Collection</p>
              <h1>{ownerLabel}</h1>
              <p className="card-lab__blurb">Loading cards…</p>
            </div>
          </header>
        </div>
      );
    }

    return (
      <div className="card-lab">
        <div className="card-lab__atmosphere" aria-hidden="true" />
        <header className="card-lab__header">
          {isRemote ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onBack}
            >
              ← Leaderboard
            </button>
          ) : null}
          <div className="card-lab__titles">
            <p className="eyebrow">{isRemote ? "Player collection" : "Collection"}</p>
            <h1 className={isRemote ? "card-lab__title-row" : undefined}>
              {isRemote && viewer?.avatar ? (
                <UserAvatar
                  crop={viewer.avatar}
                  size={56}
                  alt=""
                  className="card-lab__avatar"
                />
              ) : null}
              {isRemote ? `${ownerLabel}'s Cards` : "Card Collection"}
            </h1>
            {isRemote && !remoteError ? (
              <div className="player-showcase">
                <p className="player-showcase__label">Showcase cards</p>
                {showcaseCards.length > 0 ? (
                  <div className="player-showcase__row">
                    {showcaseCards.map((card) => (
                      <MonkeyCard
                        key={card.id}
                        entity={card.entity}
                        pathLevels={card.pathLevels}
                        mode="preview"
                        owned
                        onSelect={() => setFocused(card)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="player-showcase__empty">
                    No showcase cards yet.
                  </p>
                )}
              </div>
            ) : null}
            <p className="card-lab__blurb">
              {remoteError
                ? remoteError
                : isRemote
                  ? `${totalOwned} / ${totalCards} owned · browse by tower or open All Cards.`
                  : `${totalOwned} / ${totalCards} owned · browse by tower, or open All Cards.`}
            </p>
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
                {tradeMsg ? (
                  <p className="card-lab__trade-msg">{tradeMsg}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <div className="card-lab__picker">
          <button
            type="button"
            className="card-lab__all-btn"
            onClick={() => {
              setQuery("");
              setView({ kind: "all" });
            }}
          >
            <span className="card-lab__all-btn-title">All Cards</span>
            <span className="card-lab__all-btn-meta">
              {totalOwned} / {totalCards} owned
            </span>
          </button>

          <label className="card-lab__search">
            <span className="card-lab__search-label">Search towers</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Dart Monkey, Ninja, Military…"
              autoComplete="off"
              autoFocus
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
                  className="card-lab__tower-btn"
                  onClick={() => {
                    setQuery("");
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
      </div>
    );
  }

  // ——— All owned cards ———
  if (view.kind === "all") {
    return (
      <div className="card-lab">
        <div className="card-lab__atmosphere" aria-hidden="true" />
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
          <div className="card-lab__titles card-lab__titles--tower">
            <p className="eyebrow">{isRemote ? ownerLabel : "Owned"}</p>
            <h1>All Cards</h1>
            <p className="card-lab__blurb">
              {totalOwned === 0
                ? isRemote
                  ? "No cards unlocked yet."
                  : "You don’t own any cards yet — open packs from the shop."
                : query.trim()
                  ? `${ownedAllCards.length} matching · ${totalOwned} / ${totalCards} owned · tap a card for the holo view.`
                  : `${totalOwned} / ${totalCards} owned · tap a card for the holo view.`}
            </p>
          </div>
        </header>

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
              autoFocus
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
          <div className="card-lab__grid">
            {ownedAllCards.map((card) => (
              <MonkeyCard
                key={card.id}
                entity={card.entity}
                pathLevels={card.pathLevels}
                mode="preview"
                owned
                highlight={highlightIds.has(card.id)}
                onSelect={() => setFocused(card)}
              />
            ))}
          </div>
        )}

        {focusPortal}
      </div>
    );
  }

  // ——— Single tower card page ———
  const portrait = selectedMeta?.image ?? baseEntity(view.name)?.image;

  return (
    <div className="card-lab">
      <div className="card-lab__atmosphere" aria-hidden="true" />
      <header className="card-lab__header">
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
        <div className="card-lab__titles card-lab__titles--tower">
          <p className="eyebrow">{selectedMeta?.category ?? "Tower"}</p>
          <h1 className="card-lab__tower-heading">
            {portrait ? (
              <img src={portrait} alt="" draggable={false} />
            ) : null}
            {view.name}
          </h1>
          <p className="card-lab__blurb">
            {ownedInTower}/{towerCards.length} owned · same portrait art is
            grouped together. Tap an unlocked card for the holo view.
          </p>
        </div>
      </header>

      <div className="card-lab__toolbar card-lab__toolbar--end">
        {sortToggle}
      </div>

      <div className="card-lab__grid">
        {towerCards.map((card) => {
          const isOwned = owned.has(card.id);
          return (
            <MonkeyCard
              key={card.id}
              entity={card.entity}
              pathLevels={card.pathLevels}
              mode="preview"
              owned={isOwned}
              highlight={highlightIds.has(card.id)}
              onSelect={() => {
                if (!isOwned) return;
                setFocused(card);
              }}
            />
          );
        })}
      </div>

      <p className="card-lab__hint">
        {ownedInTower}/{towerCards.length} unlocked · Escape returns to tower
        list
      </p>

      {focusPortal}
    </div>
  );
}
