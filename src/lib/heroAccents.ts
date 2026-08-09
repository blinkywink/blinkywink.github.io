/** Theme accents for hero plates (inspired by each hero’s kit). */
export type HeroAccent = {
  primary: string;
  secondary: string;
  rgb: [number, number, number];
};

export const HERO_ACCENTS: Record<string, HeroAccent> = {
  quincy: {
    primary: "#E8A44A",
    secondary: "#5A8F3C",
    rgb: [232, 164, 74],
  },
  gwendolin: {
    primary: "#FF6A2A",
    secondary: "#FFD23F",
    rgb: [255, 106, 42],
  },
  "obyn-greenfoot": {
    primary: "#4CAF50",
    secondary: "#8D6E63",
    rgb: [76, 175, 80],
  },
  benjamin: {
    primary: "#3DDC97",
    secondary: "#2A9D8F",
    rgb: [61, 220, 151],
  },
  ezili: {
    primary: "#9B59B6",
    secondary: "#6C3483",
    rgb: [155, 89, 182],
  },
  sauda: {
    primary: "#C0392B",
    secondary: "#F4D03F",
    rgb: [192, 57, 43],
  },
  psi: {
    primary: "#5DADE2",
    secondary: "#AF7AC5",
    rgb: [93, 173, 226],
  },
  silas: {
    primary: "#7FDBFF",
    secondary: "#4A90D9",
    rgb: [127, 219, 255],
  },
};

export function heroAccent(heroId: string): HeroAccent {
  return (
    HERO_ACCENTS[heroId] ?? {
      primary: "#F0C84A",
      secondary: "#8A7A40",
      rgb: [240, 200, 74],
    }
  );
}
