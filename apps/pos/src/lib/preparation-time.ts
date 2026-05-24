/**
 * PATCH: Preparación time para app-orders-service.ts
 * 
 * Cuando el POS cambia el status de un pedido APP, calcula el tiempo de preparación.
 * 
 * INSTRUCCIONES:
 * 
 * En ~/raiz-app/apps/pos/src/lib/app-orders-service.ts,
 * busca la función que actualiza el status de un pedido (updateDoc con status).
 * 
 * Añade este import al principio:
 *   import { Timestamp } from "firebase/firestore"
 * 
 * Y en la función de updateOrderStatus, antes del updateDoc, añade:
 */

// ── Función helper para calcular tiempo de preparación ──
export function calcPrepTime(createdAt: any): { preparationTimeSecs: number; preparationTimeMin: number } {
  let startMs: number

  if (createdAt?.toDate) {
    startMs = createdAt.toDate().getTime()
  } else if (createdAt instanceof Date) {
    startMs = createdAt.getTime()
  } else if (createdAt?.seconds) {
    startMs = createdAt.seconds * 1000
  } else {
    return { preparationTimeSecs: 0, preparationTimeMin: 0 }
  }

  const diffSecs = Math.max(0, Math.round((Date.now() - startMs) / 1000))
  return {
    preparationTimeSecs: diffSecs,
    preparationTimeMin: Math.round(diffSecs / 6) / 10,
  }
}

/**
 * EJEMPLO DE USO en app-orders-service.ts:
 * 
 * Busca donde se hace updateDoc para cambiar status.
 * Modifica para que cuando status sea "READY" o "PICKED_UP",
 * también guarde el tiempo de preparación:
 * 
 * ```typescript
 * import { calcPrepTime } from "./preparation-time"
 * 
 * // En la función updateOrderStatus (o como se llame):
 * async function updateOrderStatus(orderId: string, newStatus: string) {
 *   const orderRef = doc(db, "orders", orderId)
 *   
 *   const updateData: any = {
 *     status: newStatus,
 *     updatedAt: serverTimestamp(),
 *   }
 *   
 *   // ✨ Calcular tiempo de preparación al completar
 *   if (newStatus === "READY" || newStatus === "PICKED_UP") {
 *     const orderSnap = await getDoc(orderRef)
 *     if (orderSnap.exists()) {
 *       const { preparationTimeSecs, preparationTimeMin } = calcPrepTime(orderSnap.data().createdAt)
 *       updateData.preparationTimeSecs = preparationTimeSecs
 *       updateData.preparationTimeMin = preparationTimeMin
 *       updateData.completedAt = serverTimestamp()
 *     }
 *   }
 *   
 *   await updateDoc(orderRef, updateData)
 * }
 * ```
 */
