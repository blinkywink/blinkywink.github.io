import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { TowerEntity } from "../data/types";
import { byTower, towerEntities, towers } from "../data/towers";
import { prefersKeyboardAutofocus } from "../lib/focus";
import { normalizeSearch, rankEntityMatch } from "../utils/searchEntities";

function useTouchPicker(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px), (pointer: coarse)");
    const apply = () => setTouch(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return touch;
}

export type GuessLock =
  | { kind: "base" }
  | { kind: "paragon" }
  | { kind: "upgrade"; tier: number };

type Props = {
  disabled?: boolean;
  /** Reset search when the challenge changes. */
  roundKey: string;
  onSelect: (entity: TowerEntity) => void;
  status?: "idle" | "correct" | "wrong";
  /** Wrong guesses this round - crossed out in the picker. */
  eliminatedIds?: string[];
  /** Only this tier can be submitted. */
  guessLock?: GuessLock | null;
};

function towerFamilyName(entity: TowerEntity): string {
  return entity.tower;
}

const CATEGORY_ORDER = ["Primary", "Military", "Magic", "Support"];

function pathChoices(tower: string, lock: GuessLock): TowerEntity[] {
  const members = byTower[tower] ?? [];
  if (lock.kind === "base") {
    return members.filter((e) => e.type === "tower");
  }
  if (lock.kind === "paragon") {
    return members.filter((e) => e.type === "paragon");
  }
  return members
    .filter((e) => e.type === "upgrade" && e.tier === lock.tier)
    .sort((a, b) => (a.path ?? 0) - (b.path ?? 0));
}

export function AnswerSearch({
  disabled,
  roundKey,
  onSelect,
  status = "idle",
  eliminatedIds = [],
  guessLock = null,
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const touchPicker = useTouchPicker() && Boolean(guessLock);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pickedTower, setPickedTower] = useState<string | null>(null);
  const eliminated = useMemo(() => new Set(eliminatedIds), [eliminatedIds]);

  useEffect(() => {
    setQuery("");
    setOpen(false);
    setHighlight(0);
    setPickedTower(null);
  }, [roundKey]);

  useEffect(() => {
    if (!disabled && !pickedTower && prefersKeyboardAutofocus()) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [roundKey, disabled, pickedTower]);

  const matches = useMemo(() => {
    if (!query.trim() || pickedTower) return [];
    const ranked = towerEntities
      .map((entity) => ({ entity, score: rankEntityMatch(query, entity) }))
      .filter((row) => row.score >= 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.entity.name.localeCompare(b.entity.name),
      );

    const seen = new Set<string>();
    const unique: TowerEntity[] = [];
    for (const { entity } of ranked) {
      if (seen.has(entity.tower)) continue;
      seen.add(entity.tower);
      const base =
        byTower[entity.tower]?.find((e) => e.type === "tower") ?? entity;
      unique.push(base);
      if (unique.length >= 8) break;
    }
    return unique;
  }, [query, pickedTower]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const family = useMemo(() => {
    if (!pickedTower) return null;
    const members = byTower[pickedTower] ?? [];
    const base = members.find((e) => e.type === "tower") ?? null;
    const paragon = members.find((e) => e.type === "paragon") ?? null;
    const grid: Array<Array<TowerEntity | null>> = [1, 2, 3].map((path) =>
      [1, 2, 3, 4, 5].map(
        (tier) =>
          members.find(
            (e) => e.type === "upgrade" && e.path === path && e.tier === tier,
          ) ?? null,
      ),
    );
    return { base, paragon, grid, members };
  }, [pickedTower]);

  const openTowerPicker = (entity: TowerEntity) => {
    if (disabled) return;
    const towerName = towerFamilyName(entity);
    setPickedTower(towerName);
    setQuery(towerName);
    setOpen(false);
  };

  const submit = (entity: TowerEntity) => {
    if (disabled || eliminated.has(entity.id)) return;
    onSelect(entity);
    // Wrong guesses stay on this round - drop the typed pick so the next try is fresh.
    // Correct answers leave this screen on the next render.
    setPickedTower(null);
    setQuery("");
    setOpen(false);
    if (prefersKeyboardAutofocus()) {
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  };

  const clearPicker = () => {
    if (disabled) return;
    setPickedTower(null);
    setQuery("");
    setOpen(false);
    if (prefersKeyboardAutofocus()) {
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled || pickedTower) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && matches.length) setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(matches.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length === 0) return;
      const exact = matches.find(
        (m) => normalizeSearch(m.name) === normalizeSearch(query),
      );
      openTowerPicker(exact ?? matches[Math.min(highlight, matches.length - 1)]);
    }
  };

  if (touchPicker && guessLock) {
    const choices = pickedTower ? pathChoices(pickedTower, guessLock) : [];
    const groups = CATEGORY_ORDER.map((category) => ({
      category,
      towers: towers.filter((t) => t.category === category),
    })).filter((g) => g.towers.length > 0);

    return (
      <div className={`answer-search answer-search--${status} answer-search--touch`}>
        {pickedTower ? (
          <div className={`upgrade-picker ${disabled ? "is-locked" : ""}`}>
            <div className="upgrade-picker__header">
              <strong>{pickedTower}</strong>
              <button
                type="button"
                className="upgrade-picker__change"
                onClick={clearPicker}
                disabled={disabled}
              >
                Change
              </button>
            </div>
            <div
              className="upgrade-picker__paths"
              role="group"
              style={{
                gridTemplateColumns: `repeat(${Math.max(choices.length, 1)}, minmax(0, 1fr))`,
              }}
              aria-label={
                guessLock.kind === "upgrade"
                  ? `Tier ${guessLock.tier} paths`
                  : "Path"
              }
            >
              {choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={`upgrade-picker__path ${
                    eliminated.has(choice.id) ? "is-eliminated" : ""
                  }`}
                  onClick={() => submit(choice)}
                  disabled={disabled || eliminated.has(choice.id)}
                >
                  <span className="upgrade-picker__path-name">{choice.name}</span>
                  {eliminated.has(choice.id) ? (
                    <span className="upgrade-picker__x" aria-hidden="true">
                      ✕
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="tower-pick">
            {groups.map((group) => (
              <section key={group.category} className="tower-pick__group">
                <h3 className="tower-pick__label">{group.category}</h3>
                <div className="tower-pick__grid">
                  {group.towers.map((tower) => (
                    <button
                      key={tower.id}
                      type="button"
                      className="tower-pick__btn"
                      disabled={disabled}
                      onClick={() => {
                        if (guessLock.kind === "base") {
                          submit(tower);
                          return;
                        }
                        openTowerPicker(tower);
                      }}
                    >
                      {tower.name}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`answer-search answer-search--${status}`}>
      <label className="answer-search__label" htmlFor={`${listId}-input`}>
        {pickedTower
          ? guessLock?.kind === "base"
            ? "Pick the base tower"
            : guessLock?.kind === "paragon"
              ? "Pick the paragon"
              : guessLock?.kind === "upgrade"
                ? `Pick the tier ${guessLock.tier} path`
                : "Pick the base tower or an upgrade"
          : "Search a tower, then pick the upgrade"}
      </label>
      <div className="answer-search__field">
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          className="answer-search__input"
          placeholder="Sniper, dart, Crossbow Master…"
          value={query}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          onChange={(e) => {
            setPickedTower(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onClick={() => {
            if (disabled || !pickedTower) return;
            // Click search while browsing upgrades → start a fresh tower search
            setPickedTower(null);
            setQuery("");
            setOpen(true);
          }}
          onFocus={() => {
            if (!pickedTower) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {open && matches.length > 0 && !disabled && !pickedTower ? (
          <ul
            id={`${listId}-list`}
            className="answer-search__list"
            role="listbox"
          >
            {matches.map((entity, index) => (
              <li
                key={entity.id}
                role="option"
                aria-selected={index === highlight}
              >
                <button
                  type="button"
                  className={`answer-search__option ${
                    index === highlight ? "is-active" : ""
                  }`}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => openTowerPicker(entity)}
                >
                  <img
                    src={entity.image}
                    alt=""
                    className="answer-search__thumb"
                    loading="lazy"
                    width={40}
                    height={40}
                  />
                  <span className="answer-search__option-text">
                    <span className="answer-search__option-name">
                      {entity.type === "tower" ? entity.name : entity.tower}
                    </span>
                    <span className="answer-search__option-meta">
                      {entity.category} · pick upgrade
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {family && pickedTower ? (
        <div
          className={`upgrade-picker ${disabled ? "is-locked" : ""}`}
          aria-disabled={disabled}
        >
          <div className="upgrade-picker__header">
            <strong>{pickedTower}</strong>
            <button
              type="button"
              className="upgrade-picker__change"
              onClick={clearPicker}
              disabled={disabled}
            >
              Change
            </button>
          </div>

          {(!guessLock || guessLock.kind === "base") && family.base ? (
            <button
              type="button"
              className={`upgrade-picker__base ${
                eliminated.has(family.base.id) ? "is-eliminated" : ""
              }`}
              onClick={() => submit(family.base!)}
              disabled={disabled || eliminated.has(family.base.id)}
            >
              <img
                src={family.base.image}
                alt=""
                width={48}
                height={48}
                className="upgrade-picker__base-img"
              />
              <span>
                <span className="upgrade-picker__base-label">Base tower</span>
                <span className="upgrade-picker__base-name">
                  {family.base.name}
                </span>
              </span>
              {eliminated.has(family.base.id) ? (
                <span className="upgrade-picker__x" aria-hidden="true">
                  ✕
                </span>
              ) : null}
            </button>
          ) : null}

          {!guessLock || guessLock.kind === "upgrade" ? (
          <div
            className="upgrade-picker__grid"
            role="group"
            aria-label="Upgrades"
          >
            {family.grid.map((pathRow, pathIdx) => (
              <div key={pathIdx} className="upgrade-picker__row">
                {pathRow.map((upgrade, tierIdx) =>
                  upgrade &&
                  (!guessLock ||
                    guessLock.kind !== "upgrade" ||
                    upgrade.tier === guessLock.tier) ? (
                    <button
                      key={upgrade.id}
                      type="button"
                      className={`upgrade-picker__cell ${
                        eliminated.has(upgrade.id) ? "is-eliminated" : ""
                      }`}
                      title={
                        eliminated.has(upgrade.id)
                          ? `${upgrade.name} (already guessed)`
                          : upgrade.name
                      }
                      onClick={() => submit(upgrade)}
                      disabled={disabled || eliminated.has(upgrade.id)}
                    >
                      <span
                        className={`upgrade-picker__ph upgrade-picker__ph--p${pathIdx + 1}`}
                        aria-hidden="true"
                      />
                      <span className="upgrade-picker__cell-name">
                        {upgrade.name}
                      </span>
                      {eliminated.has(upgrade.id) ? (
                        <span className="upgrade-picker__x" aria-hidden="true">
                          ✕
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <div
                      key={`empty-${pathIdx}-${tierIdx}`}
                      className="upgrade-picker__cell upgrade-picker__cell--empty"
                      aria-hidden="true"
                    />
                  ),
                )}
              </div>
            ))}
          </div>
          ) : null}

          {(!guessLock || guessLock.kind === "paragon") && family.paragon ? (
            <button
              type="button"
              className={`upgrade-picker__paragon ${
                eliminated.has(family.paragon.id) ? "is-eliminated" : ""
              }`}
              onClick={() => submit(family.paragon!)}
              disabled={disabled || eliminated.has(family.paragon.id)}
            >
              <span
                className="upgrade-picker__ph upgrade-picker__ph--paragon"
                aria-hidden="true"
              >
                ◆
              </span>
              <span>{family.paragon.name}</span>
              {eliminated.has(family.paragon.id) ? (
                <span className="upgrade-picker__x" aria-hidden="true">
                  ✕
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
