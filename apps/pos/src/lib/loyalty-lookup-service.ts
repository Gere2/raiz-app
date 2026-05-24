/**
 * loyalty-lookup-service.ts
 *
 * Busca clientes por QR (UID) o código numérico de 4 dígitos.
 * Usado por el barista para identificar clientes y asignar puntos.
 */

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore"
import { db } from "./firebase"
import type { CustomerOption } from "./customer-selector-service"

// ── Buscar por UID (desde QR) ──

export async function lookupByUID(uid: string): Promise<CustomerOption | null> {
  if (!db || !uid) return null
  try {
    const snap = await getDoc(doc(db, "customer_profiles", uid))
    if (snap.exists()) {
      const data = snap.data()
      return {
        id: snap.id,
        name: data.name || data.email || "Cliente",
        email: data.email || undefined,
        userType: data.userType || "other",
      }
    }
    return null
  } catch (err) {
    console.error("[LoyaltyLookup] Error looking up by UID:", err)
    return null
  }
}

// ── Buscar por código numérico (4 dígitos) ──

export async function lookupByNumericCode(code: string): Promise<CustomerOption | null> {
  if (!db || !code || code.length !== 4) return null
  try {
    const q = query(
      collection(db, "customer_profiles"),
      where("numericCode", "==", code)
    )
    const snap = await getDocs(q)
    if (!snap.empty) {
      const docSnap = snap.docs[0]
      const data = docSnap.data()
      return {
        id: docSnap.id,
        name: data.name || data.email || "Cliente",
        email: data.email || undefined,
        userType: data.userType || "other",
      }
    }
    return null
  } catch (err) {
    console.error("[LoyaltyLookup] Error looking up by code:", err)
    return null
  }
}
