import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, type Timestamp, limit } from "firebase/firestore"
import { db } from "./firebase"
import { cacheService } from "./cache-service"

// Tipos
export type InventoryItem = {
  id: string
  name: string
  category: string
  stock: number
  unit: string
  minStock: number
  origin?: string
  supplier?: string
  roastDate?: Timestamp
  expiryDate?: Timestamp
  batchNumber?: string
  notes?: string
  lastUpdated?: Timestamp
  createdAt?: Timestamp
}

export type InventoryMovement = {
  id: string
  itemId: string
  itemName: string
  type: "entrada" | "salida" | "ajuste"
  quantity: number
  previousStock: number
  newStock: number
  date: Timestamp
  userId?: string
  userName?: string
  notes?: string
  createdAt?: Timestamp
}

export type InventoryCategory = {
  id: string
  name: string
  description?: string
  createdAt?: Timestamp
}

export type InventorySupplier = {
  id: string
  name: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  createdAt?: Timestamp
}

// Colecciones
const INVENTORY_COLLECTION = "inventory"
const INVENTORY_MOVEMENTS_COLLECTION = "inventory_movements"
const INVENTORY_CATEGORIES_COLLECTION = "inventory_categories"
const INVENTORY_SUPPLIERS_COLLECTION = "inventory_suppliers"

// Obtener todos los items del inventario
export const getInventoryItems = async (): Promise<InventoryItem[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  // Verificar si los datos están en caché
  const cacheKey = "all_inventory_items"
  const cachedItems = cacheService.get<InventoryItem[]>(cacheKey)

  if (cachedItems) {
    console.log("Usando items de inventario en caché")
    return cachedItems
  }

  try {
    const inventoryRef = collection(db, INVENTORY_COLLECTION)
    const q = query(inventoryRef, orderBy("name"))
    const querySnapshot = await getDocs(q)

    const items = querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as InventoryItem,
    )

    // Guardar en caché
    cacheService.set(cacheKey, items)

    return items
  } catch (error: any) {
    console.error("Error al obtener items de inventario:", error)
    return []
  }
}

// Obtener items con stock bajo
export const getLowStockItems = async (): Promise<InventoryItem[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    // En lugar de usar una consulta compleja que requiere índices,
    // obtenemos todos los items y filtramos en el cliente
    const items = await getInventoryItems()
    return items.filter((item) => item.stock <= item.minStock)
  } catch (error: any) {
    console.error("Error al obtener items con stock bajo:", error)
    return []
  }
}

// Obtener movimientos de inventario recientes
export const getInventoryMovements = async (limitCount = 10): Promise<InventoryMovement[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const movementsRef = collection(db, INVENTORY_MOVEMENTS_COLLECTION)
    const q = query(movementsRef, orderBy("date", "desc"), limit(limitCount))
    const querySnapshot = await getDocs(q)

    const movements = querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as InventoryMovement,
    )

    return movements
  } catch (error: any) {
    console.error("Error al obtener movimientos de inventario:", error)
    return []
  }
}

// Añadir un nuevo item al inventario
export const addInventoryItem = async (
  item: Omit<InventoryItem, "id" | "createdAt" | "lastUpdated">,
): Promise<InventoryItem> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    // Crear un objeto limpio sin valores undefined
    const itemData: Record<string, any> = {
      name: item.name,
      category: item.category,
      stock: item.stock,
      unit: item.unit,
      minStock: item.minStock,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    }

    // Solo añadir campos opcionales si no son undefined
    if (item.supplier !== undefined) {
      itemData.supplier = item.supplier
    }

    if (item.batchNumber !== undefined) {
      itemData.batchNumber = item.batchNumber
    }

    if (item.notes !== undefined) {
      itemData.notes = item.notes
    }

    if (item.origin !== undefined) {
      itemData.origin = item.origin
    }

    if (item.roastDate !== undefined) {
      itemData.roastDate = item.roastDate
    }

    if (item.expiryDate !== undefined) {
      itemData.expiryDate = item.expiryDate
    }

    const docRef = await addDoc(collection(db, INVENTORY_COLLECTION), itemData)

    // Registrar el movimiento de entrada inicial
    await addDoc(collection(db, INVENTORY_MOVEMENTS_COLLECTION), {
      itemId: docRef.id,
      itemName: item.name,
      type: "entrada",
      quantity: item.stock,
      previousStock: 0,
      newStock: item.stock,
      date: serverTimestamp(),
      notes: "Creación inicial del item",
      createdAt: serverTimestamp(),
    })

    const newItem = {
      id: docRef.id,
      ...itemData,
    }

    // Invalidar caché
    cacheService.delete("all_inventory_items")

    return newItem as InventoryItem
  } catch (error: any) {
    console.error("Error al añadir item al inventario:", error)
    throw new Error(`Error al añadir item: ${error.message}`)
  }
}

// Añadir esta función para depurar las categorías de inventario
export const debugInventoryCategories = async (): Promise<void> => {
  if (!db) {
    console.error("Firestore no está inicializado")
    return
  }

  try {
    const categoriesRef = collection(db, INVENTORY_CATEGORIES_COLLECTION)
    const q = query(categoriesRef)
    const querySnapshot = await getDocs(q)

    console.log("Categorías en Firestore:", querySnapshot.size)
    querySnapshot.forEach((doc) => {
      console.log("Categoría:", doc.id, doc.data())
    })
  } catch (error: any) {
    console.error("Error al depurar categorías:", error)
  }
}

// Obtener todas las categorías de inventario
export const getInventoryCategories = async (): Promise<InventoryCategory[]> => {
  if (!db) {
    console.error("Firestore no está inicializado")
    throw new Error("Firestore no está inicializado")
  }

  // Verificar si los datos están en caché
  const cacheKey = "all_inventory_categories"
  const cachedCategories = cacheService.get<InventoryCategory[]>(cacheKey)

  if (cachedCategories) {
    console.log("Usando categorías de inventario en caché:", cachedCategories)
    return cachedCategories
  }

  try {
    console.log("Obteniendo categorías de inventario desde Firestore...")
    const categoriesRef = collection(db, INVENTORY_CATEGORIES_COLLECTION)
    const q = query(categoriesRef, orderBy("name"))
    const querySnapshot = await getDocs(q)

    console.log("Número de categorías encontradas:", querySnapshot.size)

    const categories = querySnapshot.docs.map((doc) => {
      const data = doc.data()
      console.log("Categoría encontrada:", doc.id, data)
      return {
        id: doc.id,
        ...data,
      } as InventoryCategory
    })

    // Guardar en caché
    cacheService.set(cacheKey, categories)
    console.log("Categorías guardadas en caché:", categories)

    return categories
  } catch (error: any) {
    console.error("Error al obtener categorías de inventario:", error)
    return []
  }
}

// Añadir una categoría de inventario
export const addInventoryCategory = async (
  category: Omit<InventoryCategory, "id" | "createdAt">,
): Promise<InventoryCategory> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    console.log("Añadiendo categoría a Firestore:", category)

    // Crear un objeto limpio sin valores undefined
    const categoryData: Record<string, any> = {
      name: category.name,
      createdAt: serverTimestamp(),
    }

    // Solo añadir description si no es undefined
    if (category.description !== undefined) {
      categoryData.description = category.description
    }

    const docRef = await addDoc(collection(db, INVENTORY_CATEGORIES_COLLECTION), categoryData)

    console.log("Categoría añadida con ID:", docRef.id)
    const newCategory = {
      id: docRef.id,
      name: category.name,
    }

    // Solo añadir description al objeto de retorno si no es undefined
    if (category.description !== undefined) {
      ;(newCategory as any).description = category.description
    }

    // Invalidar caché
    cacheService.delete("all_inventory_categories")

    return newCategory as InventoryCategory
  } catch (error: any) {
    console.error("Error al añadir categoría de inventario:", error)
    throw new Error(`Error al añadir categoría: ${error.message}`)
  }
}
