/**
 * escandallo/components/helpers.ts
 * Shared helpers for the Escandallo module.
 */

import type { Ingredient } from "./types";

export const calcTotal = (ings: Ingredient[]) =>
  ings.reduce((s, i) => s + (i.lineCost || 0), 0);

export const calcFoodCost = (cost: number, price: number) =>
  price > 0 ? (cost / price) * 100 : 0;

export const fcColor = (pct: number) =>
  pct <= 25 ? "#16a34a" : pct <= 35 ? "#ca8a04" : "#dc2626";

export const fcBg = (pct: number) =>
  pct <= 25 ? "#0a2010" : pct <= 35 ? "#1a1505" : "#200505";

export const fcLabel = (pct: number) =>
  pct <= 25 ? "Excelente" : pct <= 35 ? "Aceptable" : "Alto";
