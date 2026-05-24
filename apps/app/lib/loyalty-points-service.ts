/**
 * loyalty-points-service.ts (APP)
 *
 * Sistema de fidelización: 1€ = 100 puntos.
 * Funciones para calcular, asignar y consultar puntos de fidelidad.
 */

import {
  doc,
  getDoc,
  setDoc,
  increment,
  arrayUnion,
  Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"

// ── Tipos ──

export interface PointsTransaction {
  type: "APP" | "POS" | "QUIZ"
  amount: number
  transactionId: string
  earnedAt: unknown // Timestamp
  description: string
}

// ── Cálculo de puntos ──

/** 1€ = 100 puntos */
export function calculatePoints(euros: number): number {
  return Math.floor(euros * 100)
}

// ── Código numérico determinista (4 dígitos, nunca 0000) ──

export function generateNumericCode(uid: string): string {
  // FNV-1a inspired hash — better distribution than djb2
  let hash = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < uid.length; i++) {
    hash ^= uid.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) // FNV prime
  }
  // Map to 1000–9999 (never "0000", never 3 digits)
  const code = 1000 + (Math.abs(hash) % 9000)
  return String(code)
}

// ── Asignar puntos ──

export async function awardPoints(
  uid: string,
  amount: number,
  source: "APP" | "POS",
  transactionId: string,
  description: string,
  euroAmount?: number,
  productNames?: string[],
): Promise<void> {
  if (!uid || amount <= 0) return

  // ── V2: Server-side awarding (atomic ledger entry) ──
  const { useServerLoyalty: isServerLoyalty, serverAwardPoints } = await import("./server-loyalty")
  if (isServerLoyalty() && euroAmount !== undefined) {
    const res = await serverAwardPoints(uid, transactionId, euroAmount, productNames)
    if (!res.ok) {
      console.error("[Loyalty] Server award failed:", res.error)
    }
    return
  }

  // ── Legacy: Client-side Firestore writes (fallback) ──
  if (!db) return

  const ref = doc(db, "customer_profiles", uid)

  const transaction: PointsTransaction = {
    type: source,
    amount,
    transactionId,
    earnedAt: Timestamp.now(),
    description,
  }

  try {
    // SECURITY: Use single setDoc with merge: true to avoid N+1 queries
    // Firebase will create the document if it doesn't exist, or update if it does
    await setDoc(ref, {
      id: uid,
      uid,
      loyaltyPoints: increment(amount),
      totalPointsEarned: increment(amount),
      pointsHistory: arrayUnion(transaction),
      numericCode: generateNumericCode(uid),
      updatedAt: Timestamp.now(),
    }, { merge: true })
  } catch (err) {
    console.error("[Loyalty] Error awarding points:", err)
  }
}

// ── Consultar saldo ──

export async function getPointsBalance(uid: string): Promise<{
  loyaltyPoints: number
  totalPointsEarned: number
  numericCode: string
  pointsHistory: PointsTransaction[]
}> {
  if (!db || !uid) {
    return { loyaltyPoints: 0, totalPointsEarned: 0, numericCode: "0000", pointsHistory: [] }
  }

  try {
    const snap = await getDoc(doc(db, "customer_profiles", uid))
    if (snap.exists()) {
      const data = snap.data()
      return {
        loyaltyPoints: data.loyaltyPoints || 0,
        totalPointsEarned: data.totalPointsEarned || 0,
        numericCode: data.numericCode || generateNumericCode(uid),
        pointsHistory: (data.pointsHistory || []) as PointsTransaction[],
      }
    }
  } catch (err) {
    console.error("[Loyalty] Error getting balance:", err)
  }

  return { loyaltyPoints: 0, totalPointsEarned: 0, numericCode: generateNumericCode(uid), pointsHistory: [] }
}
