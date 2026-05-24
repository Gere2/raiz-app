/**
 * types/inventory.ts — Inventario unificado
 * Combina: Brain catalog (costes) + POS inventory (stock)
 */

export interface RawMaterial {
  id: string
  name: string

  // Unidad y stock (del POS inventory)
  unit: string
  stock: number
  minStock: number

  // Coste (del Brain catalog)
  baseUnit: string
  packQty: number
  packCost: number
  unitCost: number
  supplier: string

  // Metadata
  category?: string
  notes?: string
  lastUpdated?: unknown
  createdAt?: unknown
}

export interface InventoryMovement {
  id: string
  itemId: string
  itemName: string
  type: "entrada" | "salida" | "ajuste" | "ajuste_coste"
  quantity: number
  previousStock: number
  newStock: number
  date: unknown
  userId?: string
  userName?: string
  notes?: string
  createdAt?: unknown
}

/** Catalog item de Brain (materias primas con costes) */
export interface CatalogItem {
  id: string
  name: string
  baseUnit: string
  packQty: number
  packUnit: string
  packCost: number
  unitCost: number
  supplier: string
  createdBy?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Supplier {
  id: string
  name: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  invoiceCount?: number
  createdBy?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Invoice {
  id: string
  fileName: string
  invoiceNumber?: string
  date: string
  supplier?: string
  items: InvoiceLine[]
  subtotal: number
  tax: number
  total: number
  status: "pending" | "applied"
  createdAt?: unknown
  updatedAt?: unknown
}

export interface InvoiceLine {
  name: string
  qty: number
  unit: string
  unitPrice: number
  totalPrice: number
}
