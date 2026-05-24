/**
 * escandallo/components/types.ts
 * Shared types for the Escandallo module.
 */

export type CatalogItem = {
  id: string;
  name: string;
  baseUnit: string;
  packQty: number;
  packUnit: string;
  packCost: number;
  unitCost: number;
  supplier: string;
};

export type Ingredient = {
  id: string;
  catalogItemId: string;
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
  lineCost: number;
};

export type Recipe = {
  id: string;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  sellingPrice: number;
  totalCost: number;
  foodCostPct: number;
  ingredients?: Ingredient[];
};
