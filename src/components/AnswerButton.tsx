type Props = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  state?: "idle" | "correct" | "wrong" | "reveal";
};

export function AnswerButton({
  label,
  onClick,
  disabled,
  state = "idle",
}: Props) {
  return (
    <button
      type="button"
      className={`answer-btn answer-btn--${state}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
