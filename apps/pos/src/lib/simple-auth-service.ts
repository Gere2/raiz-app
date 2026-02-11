import { collection, doc, getDocs, setDoc, query, where, serverTimestamp } from "firebase/firestore"
import { db } from "./firebase"

// Tipos
export type UserRole = "admin" | "vendedor"

export type CafeUser = {
  id: string
  name: string
  pin: string
  role: UserRole
  createdAt: unknown
}

// Colecciones (prioridad: cafe_users)
const PRIMARY_USERS_COLLECTION = "cafe_users"
const FALLBACK_USERS_COLLECTION = "users"

// Helpers
function normalizeUser(raw: any, idFallback?: string): CafeUser | null {
  if (!raw) return null
  const id = String(raw.id ?? idFallback ?? "")
  const name = String(raw.name ?? "")
  const pin = String(raw.pin ?? "")
  const role = raw.role === "admin" ? "admin" : raw.role === "vendedor" ? "vendedor" : null
  if (!id || !name || !pin || !role) return null
  return { id, name, pin, role, createdAt: raw.createdAt }
}

async function getCollectionUsers(colName: string): Promise<CafeUser[]> {
  const snap = await getDocs(collection(db, colName))
  const list: CafeUser[] = []
  snap.forEach((d) => {
    const u = normalizeUser(d.data(), d.id)
    if (u) list.push(u)
  })
  return list
}

// Obtener usuario por nombre (busca primero en cafe_users, luego fallback users)
export const getUserByName = async (name: string): Promise<CafeUser | null> => {
  if (!db) throw new Error("Firestore no está inicializado. Verifica tu configuración de Firebase.")

  const tryFind = async (colName: string) => {
    const usersRef = collection(db, colName)
    const q = query(usersRef, where("name", "==", name))
    const querySnapshot = await getDocs(q)
    if (querySnapshot.empty) return null
    const d = querySnapshot.docs[0]
    return normalizeUser(d.data(), d.id)
  }

  return (await tryFind(PRIMARY_USERS_COLLECTION)) ?? (await tryFind(FALLBACK_USERS_COLLECTION))
}

// Registro (SIEMPRE en cafe_users)
export const registerUser = async (name: string, pin: string, role: UserRole): Promise<CafeUser> => {
  if (!db) throw new Error("Firestore no está inicializado. Verifica tu configuración de Firebase.")

  const existing = await getUserByName(name)
  if (existing) throw new Error("Este nombre de usuario ya está en uso")

  const userId = doc(collection(db, PRIMARY_USERS_COLLECTION)).id

  const newUser: CafeUser = {
    id: userId,
    name,
    pin,
    role,
    createdAt: serverTimestamp(),
  }

  await setDoc(doc(db, PRIMARY_USERS_COLLECTION, userId), newUser)
  return newUser
}

// Inicio de sesión
export const signIn = async (name: string, pin: string): Promise<CafeUser> => {
  if (!db) throw new Error("Firestore no está inicializado. Verifica tu configuración de Firebase.")

  const user = await getUserByName(name)
  if (!user) throw new Error("Usuario no encontrado")
  if (user.pin !== pin) throw new Error("PIN incorrecto")
  return user
}

// Obtener todos los usuarios (merge: cafe_users + users, sin duplicados por id)
export const getAllUsers = async (): Promise<CafeUser[]> => {
  if (!db) throw new Error("Firestore no está inicializado. Verifica tu configuración de Firebase.")

  const [primary, fallback] = await Promise.all([
    getCollectionUsers(PRIMARY_USERS_COLLECTION),
    getCollectionUsers(FALLBACK_USERS_COLLECTION),
  ])

  const map = new Map<string, CafeUser>()
  for (const u of [...fallback, ...primary]) map.set(u.id, u) // primary pisa fallback si coincide id

  // orden estable: admin primero, luego vendedor, y por nombre
  const merged = Array.from(map.values())
  merged.sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return merged
}

// Verificar acceso Firestore (lectura simple)
export const checkFirestoreAccess = async (): Promise<boolean> => {
  try {
    await getDocs(collection(db, PRIMARY_USERS_COLLECTION))
    return true
  } catch (e) {
    console.error("Error al verificar acceso a Firestore:", e)
    return false
  }
}
