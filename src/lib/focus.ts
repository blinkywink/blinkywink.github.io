/** Prefer no programmatic focus on touch phones (opens the OS keyboard). */
export function prefersKeyboardAutofocus(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
}
