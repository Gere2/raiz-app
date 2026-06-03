import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, increment, runTransaction } from "firebase/firestore"

// Definir colección para configuración
const CONFIG_COLLECTION = "config"
const COUNTER_DOC = "ticketCounter"
const FISCAL_DOC = "fiscalData"

// Multi-tenant: cada café numera sus tickets en su propia subcolección
// `orgs/{orgId}/config/ticketCounter` (las reglas permiten read/write a un
// miembro de la org). Raíz y Grano (single-tenant original) sigue en el doc
// TOP-LEVEL `config/ticketCounter` (gateado por isAdmin) para NO alterar su
// numeración fiscal. Espeja el shim de product-service (`LEGACY_TOPLEVEL_ORG`).
const LEGACY_TOPLEVEL_ORG = "raiz_y_grano"
const counterRef = (orgId: string) =>
  orgId === LEGACY_TOPLEVEL_ORG
    ? doc(db, CONFIG_COLLECTION, COUNTER_DOC)
    : doc(db, "orgs", orgId, CONFIG_COLLECTION, COUNTER_DOC)

// Definir el tipo FiscalData
export type FiscalData = {
  businessName: string
  taxId: string
  address: string
  phone: string
  email?: string
  additionalInfo?: string
}

// Inicializar el contador si no existe
export const initializeTicketCounter = async (orgId: string, startFrom = 1): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")

  try {
    const ref = counterRef(orgId)
    const counterSnap = await getDoc(ref)

    if (!counterSnap.exists()) {
      await setDoc(ref, { ticketNumber: startFrom })
    }
  } catch (error: any) {
    console.error("Error al inicializar contador de tickets:", error)
    // No propagamos el error para evitar bloquear la aplicación
    if (error.code === "permission-denied") {
      console.warn(
        "Permisos insuficientes para inicializar el contador. Se intentará más tarde cuando el usuario esté autenticado.",
      )
      return
    }
  }
}

// Obtener el siguiente número de ticket (atómico — usa runTransaction)
export const getNextTicketNumber = async (orgId: string): Promise<number> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")

  try {
    const ref = counterRef(orgId)

    const nextNumber = await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(ref)

      if (!counterSnap.exists()) {
        tx.set(ref, { ticketNumber: 1 })
        return 1
      }

      const current = counterSnap.data()?.ticketNumber || 0
      const next = current + 1
      tx.update(ref, { ticketNumber: next })
      return next
    })

    return nextNumber
  } catch (error: any) {
    console.error("Error al obtener número de ticket:", error)
    if (error.code === "permission-denied") {
      console.warn("Permisos insuficientes para acceder al contador. Usando timestamp como fallback.")
      return Date.now()
    }
    return Date.now() // Usamos timestamp como fallback
  }
}

// Ref org-scoped de datos fiscales (mismo shim que counterRef): Raíz en el doc
// top-level (intacto); otros cafés en orgs/{orgId}/config/fiscalData.
const fiscalRef = (orgId: string) =>
  orgId === LEGACY_TOPLEVEL_ORG
    ? doc(db, CONFIG_COLLECTION, FISCAL_DOC)
    : doc(db, "orgs", orgId, CONFIG_COLLECTION, FISCAL_DOC)

// Default: Raíz conserva su identidad fiscal; otros cafés NO heredan "RAÍZ y GRANO"
// (recibo legalmente correcto) — businessName en blanco hasta que el café lo fije.
const defaultFiscalData = (orgId: string): FiscalData => ({
  businessName: orgId === LEGACY_TOPLEVEL_ORG ? "RAÍZ y GRANO" : "",
  taxId: "",
  address: "",
  phone: "",
  email: "",
  additionalInfo: "",
})

// Obtener datos fiscales (org-scoped)
export const getFiscalData = async (orgId: string): Promise<FiscalData | null> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")

  try {
    const fiscalSnap = await getDoc(fiscalRef(orgId))
    if (!fiscalSnap.exists()) return defaultFiscalData(orgId)
    return fiscalSnap.data() as FiscalData
  } catch (error: any) {
    console.error("Error al obtener datos fiscales:", error)
    return defaultFiscalData(orgId)
  }
}

// Guardar datos fiscales (org-scoped)
export const saveFiscalData = async (orgId: string, data: FiscalData): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")

  try {
    await setDoc(fiscalRef(orgId), data)
  } catch (error: any) {
    console.error("Error al guardar datos fiscales:", error)
    throw error
  }
}
