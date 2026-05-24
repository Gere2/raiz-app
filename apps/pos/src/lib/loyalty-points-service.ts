/**
 * loyalty-points-service.ts (POS)
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
  type: "APP" | "POS"
  amount: number
  transactionId: string
  earnedAt: any // Timestamp
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
): Promise<void> {
  if (!db || !uid || amount <= 0) return

  const ref = doc(db, "customer_profiles", uid)

  const transaction: PointsTransaction = {
    type: source,
    amount,
    transactionId,
    earnedAt: Timestamp.now(),
    description,
  }

  try {
    const snap = await getDoc(ref)

    if (snap.exists()) {
      await setDoc(ref, {
        loyaltyPoints: increment(amount),
        totalPointsEarned: increment(amount),
        pointsHistory: arrayUnion(transaction),
        updatedAt: Timestamp.now(),
      }, { merge: true })
    } else {
      await setDoc(ref, {
        id: uid,
        uid,
        loyaltyPoints: amount,
        totalPointsEarned: amount,
        pointsHistory: [transaction],
        numericCode: generateNumericCode(uid),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }, { merge: true })
    }
  } catch (err) {
    console.error("[Loyalty] Error awarding points:", err)
  }
}
