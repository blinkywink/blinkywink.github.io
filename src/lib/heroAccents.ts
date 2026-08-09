/** Theme accents for hero plates — palette shifts each visual tier. */

export type HeroAccent = {
  primary: string;
  secondary: string;
  tertiary: string;
  rgb: [number, number, number];
};

/**
 * Visual card tiers (levels → stage):
 * 0 = Lv 1–5 · 1 = 6–10 · 2 = 11–15 · 3 = 16–19 · 4 = 20 ultra
 */
export function heroVisualTier(level: number): 0 | 1 | 2 | 3 | 4 {
  const n = Math.max(1, Math.min(20, Math.floor(level) || 1));
  if (n >= 20) return 4;
  if (n >= 16) return 3;
  if (n >= 11) return 2;
  if (n >= 6) return 1;
  return 0;
}

type TierPalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  rgb: [number, number, number];
};

/** Four escalating palettes per hero (tier 0–3); tier 4 reuses 3 colors + ultra VFX. */
const HERO_TIER_PALETTES: Record<string, TierPalette[]> = {
  quincy: [
    { primary: "#E8A44A", secondary: "#5A8F3C", tertiary: "#C4A36A", rgb: [232, 164, 74] },
    { primary: "#FFB347", secondary: "#7AC74F", tertiary: "#FFE08A", rgb: [255, 179, 71] },
    { primary: "#FFD166", secondary: "#06D6A0", tertiary: "#EF476F", rgb: [255, 209, 102] },
    { primary: "#FFE66D", secondary: "#4ECDC4", tertiary: "#FF6B6B", rgb: [255, 230, 109] },
  ],
  gwendolin: [
    { primary: "#FF6A2A", secondary: "#FFD23F", tertiary: "#C44B16", rgb: [255, 106, 42] },
    { primary: "#FF4500", secondary: "#FFB703", tertiary: "#FF1744", rgb: [255, 69, 0] },
    { primary: "#FF1744", secondary: "#FFEA00", tertiary: "#FF6D00", rgb: [255, 23, 68] },
    { primary: "#FF006E", secondary: "#FFBE0B", tertiary: "#FB5607", rgb: [255, 0, 110] },
  ],
  "obyn-greenfoot": [
    { primary: "#4CAF50", secondary: "#8D6E63", tertiary: "#81C784", rgb: [76, 175, 80] },
    { primary: "#2E7D32", secondary: "#A1887F", tertiary: "#69F0AE", rgb: [46, 125, 50] },
    { primary: "#00C853", secondary: "#C6FF00", tertiary: "#6D4C41", rgb: [0, 200, 83] },
    { primary: "#76FF03", secondary: "#B2FF59", tertiary: "#1B5E20", rgb: [118, 255, 3] },
  ],
  benjamin: [
    { primary: "#3DDC97", secondary: "#2A9D8F", tertiary: "#80CBC4", rgb: [61, 220, 151] },
    { primary: "#00E676", secondary: "#00BCD4", tertiary: "#1DE9B6", rgb: [0, 230, 118] },
    { primary: "#00F5D4", secondary: "#00BBF9", tertiary: "#9B5DE5", rgb: [0, 245, 212] },
    { primary: "#39FF14", secondary: "#00F0FF", tertiary: "#BF00FF", rgb: [57, 255, 20] },
  ],
  ezili: [
    { primary: "#9B59B6", secondary: "#6C3483", tertiary: "#CE93D8", rgb: [155, 89, 182] },
    { primary: "#8E24AA", secondary: "#E040FB", tertiary: "#4A148C", rgb: [142, 36, 170] },
    { primary: "#D500F9", secondary: "#651FFF", tertiary: "#FF4081", rgb: [213, 0, 249] },
    { primary: "#FF00E5", secondary: "#7C4DFF", tertiary: "#00E5FF", rgb: [255, 0, 229] },
  ],
  sauda: [
    { primary: "#C0392B", secondary: "#F4D03F", tertiary: "#E57373", rgb: [192, 57, 43] },
    { primary: "#B71C1C", secondary: "#FFD600", tertiary: "#FF5252", rgb: [183, 28, 28] },
    { primary: "#D50000", secondary: "#FFEA00", tertiary: "#FF6E40", rgb: [213, 0, 0] },
    { primary: "#FF1744", secondary: "#FFD600", tertiary: "#FFFFFF", rgb: [255, 23, 68] },
  ],
  psi: [
    { primary: "#5DADE2", secondary: "#AF7AC5", tertiary: "#90CAF9", rgb: [93, 173, 226] },
    { primary: "#2979FF", secondary: "#E040FB", tertiary: "#18FFFF", rgb: [41, 121, 255] },
    { primary: "#651FFF", secondary: "#00E5FF", tertiary: "#FF80AB", rgb: [101, 31, 255] },
    { primary: "#D500F9", secondary: "#00F0FF", tertiary: "#FFFFFF", rgb: [213, 0, 249] },
  ],
  silas: [
    { primary: "#7FDBFF", secondary: "#4A90D9", tertiary: "#B3E5FC", rgb: [127, 219, 255] },
    { primary: "#40C4FF", secondary: "#536DFE", tertiary: "#E1F5FE", rgb: [64, 196, 255] },
    { primary: "#00B0FF", secondary: "#7C4DFF", tertiary: "#84FFFF", rgb: [0, 176, 255] },
    { primary: "#18FFFF", secondary: "#B388FF", tertiary: "#FFFFFF", rgb: [24, 255, 255] },
  ],
};

const FALLBACK: TierPalette[] = [
  { primary: "#F0C84A", secondary: "#8A7A40", tertiary: "#E8D48B", rgb: [240, 200, 74] },
  { primary: "#FFD54F", secondary: "#A1887F", tertiary: "#FFF59D", rgb: [255, 213, 79] },
  { primary: "#FFCA28", secondary: "#FF7043", tertiary: "#FFE082", rgb: [255, 202, 40] },
  { primary: "#FFAB00", secondary: "#FF3D00", tertiary: "#FFFFFF", rgb: [255, 171, 0] },
];

export function heroAccent(heroId: string, level = 1): HeroAccent {
  const tier = heroVisualTier(level);
  const palettes = HERO_TIER_PALETTES[heroId] ?? FALLBACK;
  const idx = Math.min(tier, 3);
  return palettes[idx] ?? FALLBACK[0]!;
}
