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

// Colecciones
const PRODUCTS_COLLECTION = "products"
const CATEGORIES_COLLECTION = "categories"

// Productos
export const getProducts = async (): Promise<Product[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  // Verificar si los datos están en caché
  const cacheKey = "all_products"
  const cachedProducts = cacheService.get<Product[]>(cacheKey)

  if (cachedProducts) {
    console.log("Usando productos en caché")
    return cachedProducts
  }

  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION)
    const q = query(productsRef, orderBy("name"))
    const querySnapshot = await getDocs(q)

    const products = querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Product,
    )

    // Guardar en caché
    cacheService.set(cacheKey, products)

    return products
  } catch (error: any) {
    console.error("Error al obtener productos:", error)
    return []
  }
}

export const getProductById = async (id: string): Promise<Product | null> => {
  if (!db) throw new Error("Firestore no está inicializado")

  // Verificar si el producto está en caché
  const cacheKey = `product_${id}`
  const cachedProduct = cacheService.get<Product>(cacheKey)

  if (cachedProduct) {
    console.log("Usando producto en caché:", id)
    return cachedProduct
  }

  try {
    const docRef = doc(db, PRODUCTS_COLLECTION, id)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const product = {
        id: docSnap.id,
        ...docSnap.data(),
      } as Product

      // Guardar en caché
      cacheService.set(cacheKey, product)

      return product
    }

    return null
  } catch (error: any) {
    console.error("Error al obtener producto:", error)
    return null
  }
}

export const addProduct = async (product: Omit<Product, "id" | "createdAt" | "updatedAt">): Promise<Product> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), {
      ...product,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    const newProduct = {
      id: docRef.id,
      ...product,
    }

    // Invalidar caché relacionada
    cacheService.delete("all_products")
    cacheService.deletePattern(`products_by_category_${product.category}`)

    return newProduct
  } catch (error: any) {
    console.error("Error detallado al añadir producto:", error)
    throw new Error(`Error al añadir producto: ${error.message}`)
  }
}

export const updateProduct = async (
  id: string,
  product: Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>,
): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const docRef = doc(db, PRODUCTS_COLLECTION, id)
    await updateDoc(docRef, {
      ...product,
      updatedAt: serverTimestamp(),
    })

    // Invalidar caché relacionada
    cacheService.delete("all_products")
    cacheService.delete(`product_${id}`)
    cacheService.deletePattern("products_by_category_")
  } catch (error: any) {
    console.error("Error detallado al actualizar producto:", error)
    throw new Error(`Error al actualizar producto: ${error.message}`)
  }
}

export const deleteProduct = async (id: string): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const docRef = doc(db, PRODUCTS_COLLECTION, id)
    await deleteDoc(docRef)

    // Invalidar caché relacionada
    cacheService.delete("all_products")
    cacheService.delete(`product_${id}`)
    cacheService.deletePattern("products_by_category_")
  } catch (error: any) {
    console.error("Error detallado al eliminar producto:", error)
    throw new Error(`Error al eliminar producto: ${error.message}`)
  }
}

export const getProductsByCategory = async (categoryId: string): Promise<Product[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  // Verificar si los datos están en caché
  const cacheKey = `products_by_category_${categoryId}`
  const cachedProducts = cacheService.get<Product[]>(cacheKey)

  if (cachedProducts) {
    console.log("Usando productos por categoría en caché:", categoryId)
    return cachedProducts
  }

  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION)
    const q = query(productsRef, where("category", "==", categoryId), orderBy("name"))
    const querySnapshot = await getDocs(q)

    const products = querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Product,
    )

    // Guardar en caché
    cacheService.set(cacheKey, products)

    return products
  } catch (error: any) {
    console.error("Error al obtener productos por categoría:", error)
    return []
  }
}

// Categorías
export const getCategories = async (): Promise<Category[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  // Verificar si las categorías están en caché
  const cacheKey = "all_categories"
  const cachedCategories = cacheService.get<Category[]>(cacheKey)

  if (cachedCategories) {
    console.log("Usando categorías en caché")
    return cachedCategories
  }

  try {
    const categoriesRef = collection(db, CATEGORIES_COLLECTION)
    const q = query(categoriesRef, orderBy("name"))
    const querySnapshot = await getDocs(q)

    const categories = querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Category,
    )

    // Guardar en caché
    cacheService.set(cacheKey, categories)

    return categories
  } catch (error: any) {
    console.error("Error detallado al obtener categorías:", error)
    return []
  }
}

export const getCategoryById = async (id: string): Promise<Category | null> => {
  if (!db) throw new Error("Firestore no está inicializado")

  // Verificar si la categoría está en caché
  const cacheKey = `category_${id}`
  const cachedCategory = cacheService.get<Category>(cacheKey)

  if (cachedCategory) {
    console.log("Usando categoría en caché:", id)
    return cachedCategory
  }

  try {
    const docRef = doc(db, CATEGORIES_COLLECTION, id)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const category = {
        id: docSnap.id,
        ...docSnap.data(),
      } as Category

      // Guardar en caché
      cacheService.set(cacheKey, category)

      return category
    }

    return null
  } catch (error: any) {
    console.error("Error detallado al obtener categoría:", error)
    return null
  }
}

export const addCategory = async (category: Omit<Category, "id" | "createdAt" | "updatedAt">): Promise<Category> => {
  if (!db) {
    console.error("Firestore no está inicializado")
    throw new Error("Firestore no está inicializado")
  }

  console.log("Intentando añadir categoría:", category)

  try {
    // Verificar si ya existe una categoría con el mismo nombre
    const categoriesRef = collection(db, CATEGORIES_COLLECTION)
    const q = query(categoriesRef, where("name", "==", category.name))
    const querySnapshot = await getDocs(q)

    if (!querySnapshot.empty) {
      console.error("Ya existe una categoría con este nombre")
      throw new Error("Ya existe una categoría con este nombre")
    }

    // Añadir la categoría
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
      ...category,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    console.log("Categoría añadida con ID:", docRef.id)

    const newCategory = {
      id: docRef.id,
      ...category,
    }

    // Invalidar caché relacionada
    cacheService.delete("all_categories")

    return newCategory
  } catch (error: any) {
    console.error("Error detallado al añadir categoría:", error)
    throw new Error(`Error al añadir categoría: ${error.message}`)
  }
}

export const updateCategory = async (
  id: string,
  category: Partial<Omit<Category, "id" | "createdAt" | "updatedAt">>,
): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const docRef = doc(db, CATEGORIES_COLLECTION, id)
    await updateDoc(docRef, {
      ...category,
      updatedAt: serverTimestamp(),
    })

    // Invalidar caché relacionada
    cacheService.delete("all_categories")
    cacheService.delete(`category_${id}`)
  } catch (error: any) {
    console.error("Error detallado al actualizar categoría:", error)
    throw new Error(`Error al actualizar categoría: ${error.message}`)
  }
}

export const deleteCategory = async (id: string): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const docRef = doc(db, CATEGORIES_COLLECTION, id)
    await deleteDoc(docRef)

    // Invalidar caché relacionada
    cacheService.delete("all_categories")
    cacheService.delete(`category_${id}`)
  } catch (error: any) {
    console.error("Error detallado al eliminar categoría:", error)
    throw new Error(`Error al eliminar categoría: ${error.message}`)
  }
}

export const toggleProductAvailability = async (id: string, available: boolean): Promise<void> => {
  await updateProduct(id, { available } as any)
}
