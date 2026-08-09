import { useEffect, useMemo, useState, type ReactNode } from "react";
import { towerEntities, towers as baseTowers } from "../data/towers";
import type { TowerEntity } from "../data/types";
import {
  buildTowerCardSpecs,
  formatPathLevels,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import { MonkeyCard } from "./MonkeyCard";

const CATEGORY_ORDER = ["Primary", "Military", "Magic", "Support"];

type TowerChoice = {
  name: string;
  category: string;
  image: string;
  cardCount: number;
};

type View =
  | { kind: "towers" }
  | { kind: "all" }
  | { kind: "tower"; name: string };

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
    card.isParagon ? "paragon" : "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

const EMPTY_SET: ReadonlySet<string> = new Set();

function sameIdSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

type Props = {
  owned: ReadonlySet<string>;
  /** Currently committed selection. */
  selectedIds: ReadonlySet<string>;
  /** Apply the draft selection (bottom bar). */
  onConfirm: (ids: string[]) => void;
  confirmLabel?: string;
  multi?: boolean;
  maxSelected?: number;
  unavailableIds?: ReadonlySet<string>;
  unavailableLabel?: string;
  disabled?: boolean;
  /** Extra controls in the sticky dock (e.g. price). */
  dockExtra?: ReactNode;
};

/**
 * Collection-identical card browser for picking.
 * Tap cards to select; sticky bottom bar confirms.
 */
export function OwnedCardPicker({
  owned,
  selectedIds,
  onConfirm,
  confirmLabel = "Select",
  multi = true,
  maxSelected,
  unavailableIds,
  unavailableLabel = "They own this",
  disabled = false,
  dockExtra,
}: Props) {
  const blocked = unavailableIds ?? EMPTY_SET;
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ kind: "towers" });
  const [tierHighFirst, setTierHighFirst] = useState(true);
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedIds));

  // Only reset draft when the committed selection *contents* change.
  // Parents often pass a fresh Set each poll/render with the same ids.
  useEffect(() => {
    setDraft((prev) =>
      sameIdSet(prev, selectedIds) ? prev : new Set(selectedIds),
    );
  }, [selectedIds]);

  // Fresh view = top of page (don't keep tower-list scroll).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const filteredTowers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || view.kind !== "towers") return TOWER_CHOICES;
    return TOWER_CHOICES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [query, view.kind]);

  const ownedAllCards = useMemo(() => {
    let list = ALL_SPECS.filter((c) => owned.has(c.id));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => matchesCardQuery(c, q));
    if (tierHighFirst) {
      list = list.slice().sort((a, b) => sortCardSpecs(b, a));
    }
    if (blocked.size > 0) {
      list = list.slice().sort((a, b) => {
        const au = blocked.has(a.id) ? 1 : 0;
        const bu = blocked.has(b.id) ? 1 : 0;
        return au - bu;
      });
    }
    return list;
  }, [owned, query, tierHighFirst, blocked]);

  const towerCards = useMemo(() => {
    if (view.kind !== "tower") return [];
    const base = TOWER_SPECS[view.name] ?? [];
    if (!tierHighFirst) return base;
    return base.slice().sort((a, b) => sortCardSpecs(b, a));
  }, [view, tierHighFirst]);

  const selectedMeta =
    view.kind === "tower"
      ? (TOWER_CHOICES.find((t) => t.name === view.name) ?? null)
      : null;

  function toggle(cardId: string) {
    if (disabled || blocked.has(cardId) || !owned.has(cardId)) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
        return next;
      }
      if (!multi) return new Set([cardId]);
      if (maxSelected != null && next.size >= maxSelected) return prev;
      next.add(cardId);
      return next;
    });
  }

  /** Same grid DOM as CardLab — MonkeyCard preview, no extras. Owned only. */
  function renderCardGrid(cards: MonkeyCardSpec[]) {
    return (
      <div className="card-lab__grid">
        {cards.map((card) => {
          const on = draft.has(card.id);
          const unavailable = blocked.has(card.id);
          return (
            <div
              key={card.id}
              className={`pick-item${on ? " is-selected" : ""}${unavailable ? " is-unavailable" : ""}`}
            >
              <MonkeyCard
                entity={card.entity}
                pathLevels={card.pathLevels}
                mode="preview"
                owned
                onSelect={() => {
                  if (disabled || unavailable) return;
                  toggle(card.id);
                }}
              />
              {unavailable ? (
                <span className="pick-item__badge">{unavailableLabel}</span>
              ) : on ? (
                <span className="pick-item__badge pick-item__badge--on">
                  Selected
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const ownedTowerCards = useMemo(() => {
    const list = towerCards.filter((c) => owned.has(c.id));
    if (blocked.size === 0) return list;
    return list.slice().sort((a, b) => {
      const au = blocked.has(a.id) ? 1 : 0;
      const bu = blocked.has(b.id) ? 1 : 0;
      return au - bu;
    });
  }, [towerCards, owned, blocked]);

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

  const draftCount = draft.size;
  const dirty =
    draftCount !== selectedIds.size ||
    [...draft].some((id) => !selectedIds.has(id));

  const dock = (
    <div className="pick-dock">
      <div className="pick-dock__meta">
        <strong>
          {draftCount === 0
            ? "None selected"
            : `${draftCount} selected`}
        </strong>
        {maxSelected != null ? (
          <span>
            {draftCount}/{maxSelected}
          </span>
        ) : null}
      </div>
      {dockExtra ? <div className="pick-dock__extra">{dockExtra}</div> : null}
      <button
        type="button"
        className="btn btn--primary pick-dock__confirm"
        disabled={disabled || draftCount === 0 || (!dirty && multi)}
        onClick={() => onConfirm([...draft])}
      >
        {confirmLabel}
      </button>
    </div>
  );

  // ——— Towers ———
  if (view.kind === "towers") {
    return (
      <div className="card-lab card-lab--picker">
        <div className="pick-scroll">
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
                {owned.size} owned · tap to select
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
                    disabled={ownedN === 0}
                    onClick={() => {
                      setQuery("");
                      setTierHighFirst(true);
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
        </div>
        {dock}
      </div>
    );
  }

  // ——— All owned ———
  if (view.kind === "all") {
    return (
      <div className="card-lab card-lab--picker">
        <div className="pick-scroll">
          <header className="card-lab__header">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setQuery("");
                setView({ kind: "towers" });
              }}
            >
              ← Towers
            </button>
            <div className="card-lab__titles card-lab__titles--tower">
              <p className="eyebrow">Owned</p>
              <h1>All Cards</h1>
              <p className="card-lab__blurb">
                Tap a card, then press {confirmLabel} below.
              </p>
            </div>
          </header>

          <div className="card-lab__toolbar">
            <label className="card-lab__search card-lab__search--inline">
              <span className="card-lab__search-label">Search your cards</span>
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
              {owned.size === 0
                ? "No cards yet."
                : `No owned cards match “${query}”.`}
            </p>
          ) : (
            renderCardGrid(ownedAllCards)
          )}
        </div>
        {dock}
      </div>
    );
  }

  // ——— Single tower (owned cards only) ———
  const portrait = selectedMeta?.image ?? baseEntity(view.name)?.image;

  return (
    <div className="card-lab card-lab--picker">
      <div className="pick-scroll">
        <header className="card-lab__header">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setView({ kind: "towers" })}
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
              {ownedTowerCards.length} owned · tap a card, then{" "}
              {confirmLabel} below.
            </p>
          </div>
        </header>

        <div className="card-lab__toolbar card-lab__toolbar--end">
          {sortToggle}
        </div>

        {ownedTowerCards.length === 0 ? (
          <p className="card-lab__hint">You don’t own any {view.name} cards.</p>
        ) : (
          renderCardGrid(ownedTowerCards)
        )}
      </div>
      {dock}
    </div>
  );
}
