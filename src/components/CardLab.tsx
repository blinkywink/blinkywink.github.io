import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { towerEntities, towers as baseTowers } from "../data/towers";
import type { TowerEntity } from "../data/types";
import {
  buildTowerCardSpecs,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import { MonkeyCard } from "./MonkeyCard";

export type CardsOpenOpts = {
  /** Jump straight into a tower page after opening a tower pack. */
  tower?: string;
  /** Soft-highlight these card ids (recent pulls). */
  highlightIds?: string[];
};

type Props = {
  onBack: () => void;
  initial?: CardsOpenOpts | null;
};

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

function baseEntity(tower: string): TowerEntity | null {
  return towerEntities.find((e) => e.tower === tower && e.type === "tower") ?? null;
}

/** Player collection — owned cards in color, missing ones greyed out. */
export function CardLab({ onBack: _onBack, initial }: Props) {
  const { owned } = useCardCollection();
  const [query, setQuery] = useState("");
  const [selectedTower, setSelectedTower] = useState<string | null>(
    initial?.tower ?? null,
  );
  const [focused, setFocused] = useState<MonkeyCardSpec | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(
    () => new Set(initial?.highlightIds ?? []),
  );

  useEffect(() => {
    if (!initial) return;
    if (initial.tower) setSelectedTower(initial.tower);
    if (initial.highlightIds?.length) {
      setHighlightIds(new Set(initial.highlightIds));
    }
  }, [initial]);

  useEffect(() => {
    if (highlightIds.size === 0) return;
    const id = window.setTimeout(() => setHighlightIds(new Set()), 8000);
    return () => window.clearTimeout(id);
  }, [highlightIds]);

  const filteredTowers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOWER_CHOICES;
    return TOWER_CHOICES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [query]);

  const cards = useMemo(() => {
    if (!selectedTower) return [];
    return TOWER_SPECS[selectedTower] ?? [];
  }, [selectedTower]);

  const ownedInTower = useMemo(
    () => cards.reduce((n, c) => n + (owned.has(c.id) ? 1 : 0), 0),
    [cards, owned],
  );

  const selectedMeta = useMemo(
    () => TOWER_CHOICES.find((t) => t.name === selectedTower) ?? null,
    [selectedTower],
  );

  useEffect(() => {
    if (!focused && !selectedTower) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (focused) setFocused(null);
      else if (selectedTower) setSelectedTower(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, selectedTower]);

  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [focused]);

  // ——— Tower picker ———
  if (!selectedTower) {
    return (
      <div className="card-lab">
        <div className="card-lab__atmosphere" aria-hidden="true" />
        <header className="card-lab__header">
          <div className="card-lab__titles">
            <p className="eyebrow">Collection</p>
            <h1>Card Collection</h1>
            <p className="card-lab__blurb">
              Every legal crosspath for each tower. Owned cards are colored —
              missing ones stay grey until you pull them.
            </p>
          </div>
        </header>

        <div className="card-lab__picker">
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
                    setSelectedTower(tower.name);
                  }}
                >
                  <img src={tower.image} alt="" draggable={false} loading="lazy" />
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
    );
  }

  // ——— Single tower card page ———
  const portrait = selectedMeta?.image ?? baseEntity(selectedTower)?.image;

  return (
    <div className="card-lab">
      <div className="card-lab__atmosphere" aria-hidden="true" />
      <header className="card-lab__header">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setFocused(null);
            setSelectedTower(null);
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
            {selectedTower}
          </h1>
          <p className="card-lab__blurb">
            {ownedInTower}/{cards.length} owned · same portrait art is grouped
            together. Tap an unlocked card for the holo view.
          </p>
        </div>
      </header>

      <div className="card-lab__grid">
        {cards.map((card) => {
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
        {ownedInTower}/{cards.length} unlocked · Escape returns to tower list
      </p>

      {focused
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
        : null}
    </div>
  );
}
