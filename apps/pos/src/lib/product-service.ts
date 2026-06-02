import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  type Timestamp,
  getDoc,
} from "firebase/firestore"
import { db } from "./firebase"
import { cacheService } from "./cache-service"

// Tipos
export type Product = {
  id: string
  name: string
  price: number
  category: string
  origin?: string
  available?: boolean
  image?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export type Category = {
  id: string
  name: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

// Colecciones — MULTI-TENANT: cada café ve solo su catálogo en la subcolección
// org-scoped `orgs/{orgId}/{products|categories}` (igual que tickets). La caché
// también se prefija por orgId para no filtrar entre cafés en una misma sesión.
const PRODUCTS_COLLECTION = "products"
const CATEGORIES_COLLECTION = "categories"

// Puente de migración: Raíz y Grano (la org original, single-tenant) tiene su
// catálogo en las colecciones TOP-LEVEL `products`/`categories`, que leen también
// la PWA de cliente (Stripe-live) y varias rutas del brain. Hasta migrar esos
// datos + lectores, Raíz opera contra top-level (comportamiento IDÉNTICO a hoy →
// cero riesgo de ventas) y cualquier otro café (enverde) va aislado en su
// subcolección. Quitar esta const cuando Raíz esté migrada (ver memoria
// project_raiz_app_backend: "GATE antes de tocar Raíz").
const LEGACY_TOPLEVEL_ORG = "raiz_y_grano"
const isLegacyTopLevel = (orgId: string) => orgId === LEGACY_TOPLEVEL_ORG

const productsCol = (orgId: string) =>
  isLegacyTopLevel(orgId) ? collection(db, PRODUCTS_COLLECTION) : collection(db, "orgs", orgId, PRODUCTS_COLLECTION)
const productDoc = (orgId: string, id: string) =>
  isLegacyTopLevel(orgId) ? doc(db, PRODUCTS_COLLECTION, id) : doc(db, "orgs", orgId, PRODUCTS_COLLECTION, id)
const categoriesCol = (orgId: string) =>
  isLegacyTopLevel(orgId) ? collection(db, CATEGORIES_COLLECTION) : collection(db, "orgs", orgId, CATEGORIES_COLLECTION)
const categoryDoc = (orgId: string, id: string) =>
  isLegacyTopLevel(orgId) ? doc(db, CATEGORIES_COLLECTION, id) : doc(db, "orgs", orgId, CATEGORIES_COLLECTION, id)

const requireOrg = (orgId: string) => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
}

// Productos
export const getProducts = async (orgId: string): Promise<Product[]> => {
  requireOrg(orgId)

  const cacheKey = `${orgId}:all_products`
  const cachedProducts = cacheService.get<Product[]>(cacheKey)
  if (cachedProducts) {
    console.log("Usando productos en caché")
    return cachedProducts
  }

  try {
    const q = query(productsCol(orgId), orderBy("name"))
    const querySnapshot = await getDocs(q)
    const products = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Product)
    cacheService.set(cacheKey, products)
    return products
  } catch (error: any) {
    console.error("Error al obtener productos:", error)
    return []
  }
}

export const getProductById = async (orgId: string, id: string): Promise<Product | null> => {
  requireOrg(orgId)

  const cacheKey = `${orgId}:product_${id}`
  const cachedProduct = cacheService.get<Product>(cacheKey)
  if (cachedProduct) {
    console.log("Usando producto en caché:", id)
    return cachedProduct
  }

  try {
    const docSnap = await getDoc(productDoc(orgId, id))
    if (docSnap.exists()) {
      const product = { id: docSnap.id, ...docSnap.data() } as Product
      cacheService.set(cacheKey, product)
      return product
    }
    return null
  } catch (error: any) {
    console.error("Error al obtener producto:", error)
    return null
  }
}

export const addProduct = async (
  orgId: string,
  product: Omit<Product, "id" | "createdAt" | "updatedAt">,
): Promise<Product> => {
  requireOrg(orgId)

  try {
    const docRef = await addDoc(productsCol(orgId), {
      ...product,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    const newProduct = { id: docRef.id, ...product }
    cacheService.delete(`${orgId}:all_products`)
    cacheService.deletePattern(`${orgId}:products_by_category_${product.category}`)
    return newProduct
  } catch (error: any) {
    console.error("Error detallado al añadir producto:", error)
    throw new Error(`Error al añadir producto: ${error.message}`)
  }
}

export const updateProduct = async (
  orgId: string,
  id: string,
  product: Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>,
): Promise<void> => {
  requireOrg(orgId)

  try {
    await updateDoc(productDoc(orgId, id), { ...product, updatedAt: serverTimestamp() })
    cacheService.delete(`${orgId}:all_products`)
    cacheService.delete(`${orgId}:product_${id}`)
    cacheService.deletePattern(`${orgId}:products_by_category_`)
  } catch (error: any) {
    console.error("Error detallado al actualizar producto:", error)
    throw new Error(`Error al actualizar producto: ${error.message}`)
  }
}

export const deleteProduct = async (orgId: string, id: string): Promise<void> => {
  requireOrg(orgId)

  try {
    await deleteDoc(productDoc(orgId, id))
    cacheService.delete(`${orgId}:all_products`)
    cacheService.delete(`${orgId}:product_${id}`)
    cacheService.deletePattern(`${orgId}:products_by_category_`)
  } catch (error: any) {
    console.error("Error detallado al eliminar producto:", error)
    throw new Error(`Error al eliminar producto: ${error.message}`)
  }
}

export const getProductsByCategory = async (orgId: string, categoryId: string): Promise<Product[]> => {
  requireOrg(orgId)

  const cacheKey = `${orgId}:products_by_category_${categoryId}`
  const cachedProducts = cacheService.get<Product[]>(cacheKey)
  if (cachedProducts) {
    console.log("Usando productos por categoría en caché:", categoryId)
    return cachedProducts
  }

  try {
    const q = query(productsCol(orgId), where("category", "==", categoryId), orderBy("name"))
    const querySnapshot = await getDocs(q)
    const products = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Product)
    cacheService.set(cacheKey, products)
    return products
  } catch (error: any) {
    console.error("Error al obtener productos por categoría:", error)
    return []
  }
}

// Categorías
export const getCategories = async (orgId: string): Promise<Category[]> => {
  requireOrg(orgId)

  const cacheKey = `${orgId}:all_categories`
  const cachedCategories = cacheService.get<Category[]>(cacheKey)
  if (cachedCategories) {
    console.log("Usando categorías en caché")
    return cachedCategories
  }

  try {
    const q = query(categoriesCol(orgId), orderBy("name"))
    const querySnapshot = await getDocs(q)
    const categories = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Category)
    cacheService.set(cacheKey, categories)
    return categories
  } catch (error: any) {
    console.error("Error detallado al obtener categorías:", error)
    return []
  }
}

export const getCategoryById = async (orgId: string, id: string): Promise<Category | null> => {
  requireOrg(orgId)

  const cacheKey = `${orgId}:category_${id}`
  const cachedCategory = cacheService.get<Category>(cacheKey)
  if (cachedCategory) {
    console.log("Usando categoría en caché:", id)
    return cachedCategory
  }

  try {
    const docSnap = await getDoc(categoryDoc(orgId, id))
    if (docSnap.exists()) {
      const category = { id: docSnap.id, ...docSnap.data() } as Category
      cacheService.set(cacheKey, category)
      return category
    }
    return null
  } catch (error: any) {
    console.error("Error detallado al obtener categoría:", error)
    return null
  }
}

export const addCategory = async (
  orgId: string,
  category: Omit<Category, "id" | "createdAt" | "updatedAt">,
): Promise<Category> => {
  requireOrg(orgId)

  try {
    // Verificar si ya existe una categoría con el mismo nombre (dentro de la org)
    const dupQ = query(categoriesCol(orgId), where("name", "==", category.name))
    const dupSnap = await getDocs(dupQ)
    if (!dupSnap.empty) {
      throw new Error("Ya existe una categoría con este nombre")
    }

    const docRef = await addDoc(categoriesCol(orgId), {
      ...category,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    const newCategory = { id: docRef.id, ...category }
    cacheService.delete(`${orgId}:all_categories`)
    return newCategory
  } catch (error: any) {
    console.error("Error detallado al añadir categoría:", error)
    throw new Error(`Error al añadir categoría: ${error.message}`)
  }
}

export const updateCategory = async (
  orgId: string,
  id: string,
  category: Partial<Omit<Category, "id" | "createdAt" | "updatedAt">>,
): Promise<void> => {
  requireOrg(orgId)

  try {
    await updateDoc(categoryDoc(orgId, id), { ...category, updatedAt: serverTimestamp() })
    cacheService.delete(`${orgId}:all_categories`)
    cacheService.delete(`${orgId}:category_${id}`)
  } catch (error: any) {
    console.error("Error detallado al actualizar categoría:", error)
    throw new Error(`Error al actualizar categoría: ${error.message}`)
  }
}

export const deleteCategory = async (orgId: string, id: string): Promise<void> => {
  requireOrg(orgId)

  try {
    await deleteDoc(categoryDoc(orgId, id))
    cacheService.delete(`${orgId}:all_categories`)
    cacheService.delete(`${orgId}:category_${id}`)
  } catch (error: any) {
    console.error("Error detallado al eliminar categoría:", error)
    throw new Error(`Error al eliminar categoría: ${error.message}`)
  }
}

export const toggleProductAvailability = async (
  orgId: string,
  id: string,
  available: boolean,
): Promise<void> => {
  await updateProduct(orgId, id, { available } as any)
}
