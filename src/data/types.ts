export type EntityType = "tower" | "upgrade" | "paragon";

export type TowerEntity = {
  id: string;
  name: string;
  type: EntityType;
  tower: string;
  category: string;
  path: number | null;
  tier: number;
  image: string;
  sourceFile: string;
  /** Medium difficulty cash cost (from Bloons Wiki Upgrades). */
  cost: number;
};

export type MapEntity = {
  id: string;
  name: string;
  difficulty: string;
  image: string;
  sourceFile: string;
};
