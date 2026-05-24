/**
 * customer-selector-service.ts
 *
 * Fetches registered customers from `customer_profiles`. La app cliente
 * registra todos los usuarios aquí (estudiantes, profesores, "other"); el
 * POS los busca para asociar bonos y canjes.
 */

import {
  collection,
  getDocs,
} from "firebase/firestore"
import { db } from "./firebase"

// ── Tipos ──

export interface CustomerOption {
  id: string
  name: string
  email?: string
  userType: "student" | "teacher" | "other"
}

// ── Cache simple en memoria ──
//
// TTL corto (60 s): cuando un cliente recién se registra desde la app, el
// barista debe poder verlo casi de inmediato. Antes era 5 min y daba la
// sensación de que "no aparecen".
let cachedAll: CustomerOption[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60 * 1000

function isCacheValid(): boolean {
  return Date.now() - cacheTimestamp < CACHE_TTL
}

export function invalidateCustomerCache(): void {
  cachedAll = null
  cacheTimestamp = 0
}

// ── Consulta única ──
//
// Una sola lectura de `customer_profiles` sin filtro `userType`. Antes había
// dos queries separadas (`student` y `teacher`) que excluían cualquier perfil
// con `userType: "other"` o sin campo `userType`. Eso hacía que clientes
// recién registrados no apareciesen.
async function fetchAllProfiles(): Promise<CustomerOption[]> {
  if (!db) return []
  try {
    const snap = await getDocs(collection(db, "customer_profiles"))
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>
        const name = (data.name as string) || (data.email as string) || "Sin nombre"
        const email = (data.email as string) || undefined
        const rawType = data.userType as string | undefined
        const userType: CustomerOption["userType"] =
          rawType === "student" || rawType === "teacher" ? rawType : "other"
        return {
          id: d.id,
          name,
          email,
          userType,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error("[CustomerSelector] Error fetching customers:", err)
    return []
  }
}

/**
 * Devuelve todos los clientes registrados (cualquier `userType`). Cache 60 s.
 * Pasa `force=true` para saltar el cache (usar tras un botón "↻" en UI).
 */
export async function getAllCustomers(force = false): Promise<CustomerOption[]> {
  if (!force && cachedAll && isCacheValid()) return cachedAll
  cachedAll = await fetchAllProfiles()
  cacheTimestamp = Date.now()
  return cachedAll
}

// ── Compatibilidad con código existente ──
//
// Los modales de grant/redeem antes pedían students y teachers por separado.
// Hoy todos viven en una sola lista. Dejamos estas funciones como wrappers
// para no obligar a refactorizar todos los call sites a la vez.

export async function getStudents(): Promise<CustomerOption[]> {
  const all = await getAllCustomers()
  return all.filter((c) => c.userType === "student")
}

export async function getTeachers(): Promise<CustomerOption[]> {
  const all = await getAllCustomers()
  return all.filter((c) => c.userType === "teacher")
}
