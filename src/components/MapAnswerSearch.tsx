import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { maps } from "../data/maps";
import type { MapEntity } from "../data/types";
import { prefersKeyboardAutofocus } from "../lib/focus";
import { normalizeSearch } from "../utils/searchEntities";

type Props = {
  disabled?: boolean;
  roundKey: string;
  onSelect: (entity: MapEntity) => void;
  status?: "idle" | "correct" | "wrong";
  eliminatedIds?: string[];
};

function rankMap(query: string, map: MapEntity): number {
  const q = normalizeSearch(query);
  if (!q) return -1;
  const name = normalizeSearch(map.name);
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 50;
  const diff = normalizeSearch(map.difficulty);
  if (diff.startsWith(q)) return 20;
  // acronym / initials soft match
  const initials = map.name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toLowerCase();
  if (initials.startsWith(q) && q.length >= 2) return 35;
  return -1;
}

export function MapAnswerSearch({
  disabled,
  roundKey,
  onSelect,
  status = "idle",
  eliminatedIds = [],
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const eliminated = useMemo(() => new Set(eliminatedIds), [eliminatedIds]);

  useEffect(() => {
    setQuery("");
    setOpen(false);
    setHighlight(0);
  }, [roundKey]);

  useEffect(() => {
    if (!disabled && prefersKeyboardAutofocus()) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [roundKey, disabled]);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return maps
      .map((entity) => ({ entity, score: rankMap(query, entity) }))
      .filter((row) => row.score >= 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.entity.name.localeCompare(b.entity.name),
      )
      .slice(0, 8)
      .map((row) => row.entity);
  }, [query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const submit = (entity: MapEntity) => {
    if (disabled || eliminated.has(entity.id)) return;
    onSelect(entity);
    // Wrong guesses stay on this round - clear so the next try isn't stuck on this map.
    setQuery("");
    setOpen(false);
    if (prefersKeyboardAutofocus()) {
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
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
      if (!matches.length) return;
      const exact = matches.find(
        (m) => normalizeSearch(m.name) === normalizeSearch(query),
      );
      submit(exact ?? matches[Math.min(highlight, matches.length - 1)]!);
    }
  };

  return (
    <div className={`answer-search answer-search--${status}`}>
      <label className="answer-search__label" htmlFor={`${listId}-input`}>
        Search a map
      </label>
      <div className="answer-search__field">
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          className="answer-search__input"
          placeholder="Monkey Meadow, Logs, #Ouch…"
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
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {open && matches.length > 0 && !disabled ? (
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
                  } ${eliminated.has(entity.id) ? "is-eliminated" : ""}`}
                  disabled={eliminated.has(entity.id)}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => submit(entity)}
                >
                  <img
                    src={entity.image}
                    alt=""
                    className="answer-search__thumb answer-search__thumb--map"
                    loading="lazy"
                    width={56}
                    height={38}
                  />
                  <span className="answer-search__option-text">
                    <span className="answer-search__option-name">
                      {entity.name}
                    </span>
                    <span className="answer-search__option-meta">
                      {entity.difficulty}
                      {eliminated.has(entity.id) ? " · already guessed" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
