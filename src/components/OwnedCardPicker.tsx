import { useMemo, useState } from "react";
import { towers as baseTowers } from "../data/towers";
import {
  allCardSpecs,
  matchesCardQuery,
} from "../lib/cardCatalog";
import {
  buildTowerCardSpecs,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import { MonkeyCard } from "./MonkeyCard";

const CATEGORY_ORDER = ["Primary", "Military", "Magic", "Support"];

type TowerChoice = {
  name: string;
  category: string;
  image: string;
};

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
  }));

const TOWER_SPECS: Record<string, MonkeyCardSpec[]> = Object.fromEntries(
  TOWER_CHOICES.map((t) => [t.name, buildTowerCardSpecs(t.name)]),
);

const EMPTY_SET: ReadonlySet<string> = new Set();

type Props = {
  owned: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  onToggle: (cardId: string) => void;
  disabled?: boolean;
  maxSelected?: number;
  onMaxReached?: () => void;
  /** Cards that cannot be selected (e.g. partner already owns). */
  unavailableIds?: ReadonlySet<string>;
  unavailableLabel?: string;
};

/**
 * Pick owned cards: tower list first, then real MonkeyCard grid.
 * Search (2+ chars) also shows real cards.
 */
export function OwnedCardPicker({
  owned,
  selectedIds,
  onToggle,
  disabled = false,
  maxSelected,
  onMaxReached,
  unavailableIds,
  unavailableLabel = "Already owned",
}: Props) {
  const [query, setQuery] = useState("");
  const [tower, setTower] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length >= 2;
  const blocked = unavailableIds ?? EMPTY_SET;

  const ownedByTower = useMemo(() => {
    const map = new Map<string, number>();
    for (const choice of TOWER_CHOICES) {
      const specs = TOWER_SPECS[choice.name] ?? [];
      let n = 0;
      for (const c of specs) if (owned.has(c.id)) n += 1;
      map.set(choice.name, n);
    }
    return map;
  }, [owned]);

  const towerList = useMemo(() => {
    if (searching) return TOWER_CHOICES;
    if (!q) return TOWER_CHOICES;
    return TOWER_CHOICES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [q, searching]);

  const searchResults = useMemo(() => {
    if (!searching) return [] as MonkeyCardSpec[];
    return allCardSpecs().filter(
      (c) => owned.has(c.id) && matchesCardQuery(c, q),
    );
  }, [owned, q, searching]);

  const towerCards = useMemo(() => {
    if (!tower) return [] as MonkeyCardSpec[];
    return (TOWER_SPECS[tower] ?? []).filter((c) => owned.has(c.id));
  }, [tower, owned]);

  function pick(cardId: string) {
    if (disabled || blocked.has(cardId)) return;
    if (!selectedIds.has(cardId) && maxSelected != null) {
      if (selectedIds.size >= maxSelected) {
        onMaxReached?.();
        return;
      }
    }
    onToggle(cardId);
  }

  function renderCardGrid(cards: MonkeyCardSpec[]) {
    return (
      <div className="owned-picker__grid">
        {cards.map((card) => {
          const on = selectedIds.has(card.id);
          const unavailable = blocked.has(card.id);
          return (
            <button
              key={card.id}
              type="button"
              className={`owned-picker__card${on ? " is-selected" : ""}${unavailable ? " is-unavailable" : ""}`}
              disabled={disabled || unavailable}
              aria-pressed={on}
              title={unavailable ? unavailableLabel : undefined}
              onClick={() => pick(card.id)}
            >
              <MonkeyCard
                entity={card.entity}
                pathLevels={card.pathLevels}
                mode="preview"
                owned
                staticArt
              />
              <span className="owned-picker__card-tag">
                {unavailable
                  ? unavailableLabel
                  : on
                    ? "Selected"
                    : "Select"}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="owned-picker">
      <label className="owned-picker__search">
        <span>Search cards</span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length >= 2) setTower(null);
          }}
          placeholder="Type a name… or open a tower below"
          autoComplete="off"
        />
      </label>

      {searching ? (
        <div className="owned-picker__results">
          <p className="owned-picker__hint">
            {searchResults.length} card{searchResults.length === 1 ? "" : "s"}
          </p>
          {searchResults.length === 0 ? (
            <p className="owned-picker__empty">No owned cards match.</p>
          ) : (
            renderCardGrid(searchResults)
          )}
        </div>
      ) : tower ? (
        <div className="owned-picker__results">
          <div className="owned-picker__tower-bar">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setTower(null)}
            >
              ← Towers
            </button>
            <h3>{tower}</h3>
            <span>{towerCards.length} owned</span>
          </div>
          {towerCards.length === 0 ? (
            <p className="owned-picker__empty">
              You don’t own any {tower} cards.
            </p>
          ) : (
            renderCardGrid(towerCards)
          )}
        </div>
      ) : (
        <div className="owned-picker__towers" role="list">
          {towerList.map((t) => {
            const n = ownedByTower.get(t.name) ?? 0;
            return (
              <button
                key={t.name}
                type="button"
                role="listitem"
                className="owned-picker__tower"
                disabled={n === 0 || disabled}
                onClick={() => setTower(t.name)}
              >
                <img src={t.image} alt="" draggable={false} loading="lazy" />
                <span className="owned-picker__tower-meta">
                  <strong>{t.name}</strong>
                  <span>
                    {t.category} · {n} owned
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
