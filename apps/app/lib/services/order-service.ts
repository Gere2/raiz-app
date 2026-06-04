/**
 * order-service.ts
 *
 * Shared service for order creation logic.
 * Used by both checkout/page.tsx and checkout/CheckoutClient.tsx
 * to avoid duplication and maintain consistency.
 */

import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { enrichAppOrder } from "@/lib/enrich-app-order"
import { fetchOrderingEvaluation } from "@/lib/app-ordering-status"

export interface CreateOrderInput {
  userId: string
  customerName: string
  customerEmail: string
  items: Array<{
    product: { id: string; name: string; price: number }
    qty: number
    modifiers?: { milk?: string }
  }>
  total: number
  pickupType: "ASAP" | "SCHEDULED"
  pickupTime?: string
  notes: string
  paymentIntentId?: string
  paymentStatus?: "PENDING" | "PAID"
  paymentMethod?: "CARD" | "CASH"
}

export async function createOrder(input: CreateOrderInput) {
  // Bloqueo: si los pedidos por la app están en pausa / fuera de horario, no se crea.
  const ordering = await fetchOrderingEvaluation()
  if (!ordering.open) {
    throw new Error(ordering.message || "Los pedidos por la app están cerrados ahora mismo.")
  }

  const enrichData = await enrichAppOrder(
    input.items,
    input.userId
  )

  const orderData = {
    ...enrichData,
    source: "APP",
    orgId: "raiz_y_grano", // single-tenant: el dashboard/margins del brain filtra por orgId
    customerUid: input.userId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    items: input.items.map((i) => ({
      productId: i.product.id,
      productName: i.product.name,
      unitPrice: i.product.price,
      qty: i.qty,
      ...(i.modifiers ? { modifiers: i.modifiers } : {}),
    })),
    total: input.total,
    pickupType: input.pickupType,
    pickupTimeLabel:
      input.pickupType === "SCHEDULED" && input.pickupTime
        ? input.pickupTime
        : null,
    notes: input.notes.trim() || null,
    status: "CREATED",
    paymentMethod: input.paymentMethod || "CARD",
    paymentStatus: input.paymentStatus || "PENDING",
    ...(input.paymentIntentId && {
      paymentIntentId: input.paymentIntentId,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = await addDoc(collection(db, "orders"), orderData)
  return { id: docRef.id, ...orderData }
}

/**
 * Update an existing order with payment intent ID and status.
 * Useful for linking payment intents to orders created without payment.
 */
export async function updateOrderPayment(
  orderId: string,
  paymentIntentId: string,
  paymentStatus: "PENDING" | "PAID" | "FAILED"
) {
  const orderRef = doc(db, "orders", orderId)
  await updateDoc(orderRef, {
    paymentIntentId,
    paymentStatus,
    updatedAt: serverTimestamp(),
  })
}
