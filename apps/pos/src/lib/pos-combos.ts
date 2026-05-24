// POS Quick Combos Library
// One-tap combos for peak-hour efficiency

export interface ComboItem {
  productName: string
  qty: number
}

export interface QuickCombo {
  id: string
  name: string
  emoji: string
  items: ComboItem[]
  description?: string
}

export const QUICK_COMBOS: QuickCombo[] = [
  {
    id: "combo-cafe-bizcocho",
    name: "Café + Bizcocho",
    emoji: "☕🍰",
    items: [
      { productName: "Café", qty: 1 },
      { productName: "Bizcocho", qty: 1 },
    ],
    description: "Clásica merienda",
  },
  {
    id: "combo-cafe-tostada",
    name: "Café + Tostada",
    emoji: "☕🍞",
    items: [
      { productName: "Café", qty: 1 },
      { productName: "Tostada", qty: 1 },
    ],
    description: "Desayuno rápido",
  },
  {
    id: "combo-matcha-galleta",
    name: "Matcha + Galleta",
    emoji: "🍵🍪",
    items: [
      { productName: "Matcha Latte", qty: 1 },
      { productName: "Galleta", qty: 1 },
    ],
    description: "Alternativa sana",
  },
  {
    id: "combo-doble-cafe",
    name: "Doble Café",
    emoji: "☕☕",
    items: [
      { productName: "Café", qty: 2 },
    ],
    description: "Dosis extra",
  },
]

export function getComboById(id: string): QuickCombo | undefined {
  return QUICK_COMBOS.find((c) => c.id === id)
}

export function getTopCombos(limit: number = 3): QuickCombo[] {
  return QUICK_COMBOS.slice(0, limit)
}
