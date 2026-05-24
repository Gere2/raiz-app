import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, increment, runTransaction } from "firebase/firestore"

// Definir colección para configuración
const CONFIG_COLLECTION = "config"
const COUNTER_DOC = "ticketCounter"
const FISCAL_DOC = "fiscalData"

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
export const initializeTicketCounter = async (startFrom = 1): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    // Usar la colección 'config' para el documento 'ticketCounter'
    const counterRef = doc(db, CONFIG_COLLECTION, COUNTER_DOC)
    const counterSnap = await getDoc(counterRef)

    if (!counterSnap.exists()) {
      await setDoc(counterRef, { ticketNumber: startFrom })
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
export const getNextTicketNumber = async (): Promise<number> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const counterRef = doc(db, CONFIG_COLLECTION, COUNTER_DOC)

    const nextNumber = await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef)

      if (!counterSnap.exists()) {
        tx.set(counterRef, { ticketNumber: 1 })
        return 1
      }

      const current = counterSnap.data()?.ticketNumber || 0
      const next = current + 1
      tx.update(counterRef, { ticketNumber: next })
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

// Obtener datos fiscales
export const getFiscalData = async (): Promise<FiscalData | null> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    // Usar la colección 'config' para el documento 'fiscalData'
    const fiscalRef = doc(db, CONFIG_COLLECTION, FISCAL_DOC)
    const fiscalSnap = await getDoc(fiscalRef)

    if (!fiscalSnap.exists()) {
      // Si no existen datos fiscales, devolver valores por defecto
      return {
        businessName: "RAÍZ y GRANO",
        taxId: "",
        address: "",
        phone: "",
        email: "",
        additionalInfo: "",
      }
    }

    return fiscalSnap.data() as FiscalData
  } catch (error: any) {
    console.error("Error al obtener datos fiscales:", error)
    // En caso de error, devolver valores por defecto
    return {
      businessName: "RAÍZ y GRANO",
      taxId: "",
      address: "",
      phone: "",
      email: "",
      additionalInfo: "",
    }
  }
}

// Guardar datos fiscales
export const saveFiscalData = async (data: FiscalData): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    // Usar la colección 'config' para el documento 'fiscalData'
    const fiscalRef = doc(db, CONFIG_COLLECTION, FISCAL_DOC)
    await setDoc(fiscalRef, data)
  } catch (error: any) {
    console.error("Error al guardar datos fiscales:", error)
    throw error
  }
}
