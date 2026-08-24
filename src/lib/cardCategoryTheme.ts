/** Soft T0-T3 field color by BTD6 class. */
export const CATEGORY_TINT: Record<string, string> = {
  Primary: "#3eb0f4",
  Military: "#4ed05a",
  Magic: "#a56eeb",
  Support: "#edc230",
};

/** Dark plastic shell / outline, matching the old Primary navy. */
export const CATEGORY_SHELL: Record<string, string> = {
  Primary: "#12304a",
  Military: "#143a18",
  Magic: "#2a1648",
  Support: "#3a3010",
};

export function categoryTint(category: string | null | undefined): string {
  return CATEGORY_TINT[category ?? ""] ?? CATEGORY_TINT.Primary!;
}

export function categoryShell(category: string | null | undefined): string {
  return CATEGORY_SHELL[category ?? ""] ?? CATEGORY_SHELL.Primary!;
}
