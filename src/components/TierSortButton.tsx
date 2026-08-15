type Props = {
  highFirst: boolean;
  onToggle: () => void;
};

/** Compact “Sort” + arrow — high→low vs low→high. */
export function TierSortButton({ highFirst, onToggle }: Props) {
  return (
    <button
      type="button"
      className="card-lab__sort"
      onClick={onToggle}
      aria-pressed={highFirst}
      aria-label={highFirst ? "Sort high to low" : "Sort low to high"}
    >
      Sort
      <span
        className={`card-lab__sort-arrow${highFirst ? " is-down" : ""}`}
        aria-hidden
      />
    </button>
  );
}
