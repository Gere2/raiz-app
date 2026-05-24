import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp } from "firebase/firestore"
import { db } from "./firebase"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "./firebase-auth"

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

// Inicio de sesion (AUTH FIRST)
// Nota: con rules cerradas, NO podemos leer Firestore antes de autenticar.
// Usamos "name" como email.
export const signIn = async (name: string, pin: string): Promise<CafeUser> => {
  if (!db) throw new Error("Firestore no esta inicializado. Verifica tu configuracion de Firebase.")

  const email = String(name || "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Introduce un email v\u00e1lido (usuario)")

  try {
    await signInWithEmailAndPassword(auth, email, pin)
    await auth.currentUser?.getIdToken(true)
  } catch (e) {
    console.error("Error en login Firebase Auth:", e)
    throw new Error("Email o PIN incorrecto")
  }

  // Ya autenticado => ahora SI podemos leer Firestore
  const ref = doc(db, PRIMARY_USERS_COLLECTION, email)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    // Si no existe doc, igual permitimos entrar (porque Auth + claim manda),
    // pero devolvemos un user minimo
    return { id: email, name: email, pin: "", role: "vendedor", createdAt: null } as any
  }

  const data = snap.data()
  return normalizeUser(data, snap.id) as CafeUser
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
    console.log("[checkFirestoreAccess] auth.currentUser:", auth.currentUser?.email || null)

    if (!auth.currentUser) {
      console.log("[checkFirestoreAccess] NO AUTH -> false")
      return false
    }

    const token = await auth.currentUser.getIdTokenResult(true)
    console.log("[checkFirestoreAccess] claims:", token.claims)

    await getDocs(collection(db, "config"))
    console.log("[checkFirestoreAccess] OK config read")
    return true
  } catch (e) {
    console.error("[checkFirestoreAccess] ERROR:", e)
    return false
  }
}
