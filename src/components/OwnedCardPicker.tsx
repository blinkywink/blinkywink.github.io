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
import { CardChip } from "./CardChip";

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

type Props = {
  owned: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  onToggle: (cardId: string) => void;
  disabled?: boolean;
  /** When set, refuse selecting more than this many. */
  maxSelected?: number;
  onMaxReached?: () => void;
};

/**
 * Pick owned cards without dumping every MonkeyCard at once.
 * Default: tower list. Click a tower, or search (2+ chars).
 */
export function OwnedCardPicker({
  owned,
  selectedIds,
  onToggle,
  disabled = false,
  maxSelected,
  onMaxReached,
}: Props) {
  const [query, setQuery] = useState("");
  const [tower, setTower] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length >= 2;

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
    const tq = q;
    if (!tq) return TOWER_CHOICES;
    return TOWER_CHOICES.filter(
      (t) =>
        t.name.toLowerCase().includes(tq) ||
        t.category.toLowerCase().includes(tq),
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
    if (disabled) return;
    if (!selectedIds.has(cardId) && maxSelected != null) {
      if (selectedIds.size >= maxSelected) {
        onMaxReached?.();
        return;
      }
    }
    onToggle(cardId);
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
          placeholder="Type at least 2 letters… or pick a tower below"
          autoComplete="off"
        />
      </label>

      {searching ? (
        <div className="owned-picker__results">
          <p className="owned-picker__hint">
            {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
          </p>
          {searchResults.length === 0 ? (
            <p className="owned-picker__empty">No owned cards match.</p>
          ) : (
            <div className="owned-picker__chips">
              {searchResults.map((card) => (
                <CardChip
                  key={card.id}
                  card={card}
                  selected={selectedIds.has(card.id)}
                  disabled={disabled}
                  actionLabel={selectedIds.has(card.id) ? "Added" : "Add"}
                  onClick={() => pick(card.id)}
                />
              ))}
            </div>
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
            <p className="owned-picker__empty">You don’t own any {tower} cards.</p>
          ) : (
            <div className="owned-picker__chips">
              {towerCards.map((card) => (
                <CardChip
                  key={card.id}
                  card={card}
                  selected={selectedIds.has(card.id)}
                  disabled={disabled}
                  actionLabel={selectedIds.has(card.id) ? "Added" : "Add"}
                  onClick={() => pick(card.id)}
                />
              ))}
            </div>
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
