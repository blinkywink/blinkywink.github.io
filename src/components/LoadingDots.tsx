type Props = {
  label?: string;
  className?: string;
};

/** Three bouncing dots. Hidden until the page is actually ready. */
export function LoadingDots({ label = "Loading", className }: Props) {
  return (
    <p
      className={`loading-dots${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span />
      <span />
      <span />
    </p>
  );
}
