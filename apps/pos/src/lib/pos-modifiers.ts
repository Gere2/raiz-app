// POS Modifiers Library
// Inline modifiers available for quick customization

export interface Modifier {
  id: string
  name: string
  priceAdjustment: number // in EUR, 0 for free modifiers
  group: "milk" | "extra" | "special" | "quantity"
}

export const MODIFIERS: Modifier[] = [
  // Milk alternatives
  { id: "milk-veg", name: "Leche vegetal", priceAdjustment: 0.30, group: "milk" },
  { id: "milk-normal", name: "Leche normal", priceAdjustment: 0, group: "milk" },

  // Extra shots and quantities
  { id: "extra-shot", name: "Extra shot", priceAdjustment: 0.40, group: "extra" },
  { id: "double-shot", name: "Doble shot", priceAdjustment: 0.60, group: "extra" },

  // Preparation methods
  { id: "decaf", name: "Descafeinado", priceAdjustment: 0, group: "special" },
  { id: "no-sugar", name: "Sin azúcar", priceAdjustment: 0, group: "special" },
  { id: "ice", name: "Con hielo", priceAdjustment: 0, group: "special" },
  { id: "light", name: "Ligero", priceAdjustment: 0, group: "special" },
]

export function getModifiersByGroup(group: Modifier["group"]): Modifier[] {
  return MODIFIERS.filter((m) => m.group === group)
}

export function getModifierById(id: string): Modifier | undefined {
  return MODIFIERS.find((m) => m.id === id)
}

export function calculateModifierPrice(modifierIds: string[]): number {
  return modifierIds.reduce((total, id) => {
    const modifier = getModifierById(id)
    return total + (modifier?.priceAdjustment || 0)
  }, 0)
}
