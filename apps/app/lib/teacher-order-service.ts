/**
 * teacher-order-service.ts
 *
 * Service for teacher orders placed from the customer app.
 * Collection: orders (same as APP orders, with source="TEACHER_APP")
 * This way teacher orders appear in the POS alongside regular APP orders.
 * Only accessible by authenticated users with userType === "teacher"
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  TeacherOrder,
  TeacherOrderItem,
  TeacherDeliveryInfo,
  MeetingCombo,
} from "@/types/teacher-order";

/** Now uses the unified "orders" collection so POS sees teacher orders */
const ORDERS_COLLECTION = "orders";
const COMBOS_COLLECTION = "meeting_combos";

/** Extract millis from Firestore Timestamp or Date */
function toMillis(ts: TeacherOrder["createdAt"]): number {
  if (!ts) return 0;
  if (typeof (ts as { toMillis?: () => number }).toMillis === "function") {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof (ts as { seconds?: number }).seconds === "number") {
    return (ts as { seconds: number }).seconds * 1000;
  }
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

// ══════════════════════════════════════
// VERIFY TEACHER STATUS
// ══════════════════════════════════════

export async function isTeacher(uid: string): Promise<boolean> {
  if (!db || !uid) return false;
  try {
    const profileRef = doc(db, "customer_profiles", uid);
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    return data.userType === "teacher";
  } catch (err) {
    console.error("[TeacherOrder] Error checking teacher status:", err);
    return false;
  }
}

// ══════════════════════════════════════
// MEETING COMBOS
// ══════════════════════════════════════

export async function getMeetingCombos(): Promise<MeetingCombo[]> {
  if (!db) return [];
  try {
    // Simple query without composite index requirement
    // Filter available client-side to avoid needing a composite index
    const snap = await getDocs(collection(db, COMBOS_COLLECTION));
    const combos = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as MeetingCombo))
      .filter((c) => c.available !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return combos;
  } catch (err) {
    console.error("[TeacherOrder] Error fetching combos:", err);
    return [];
  }
}

// ══════════════════════════════════════
// CREATE TEACHER ORDER
// ══════════════════════════════════════

export async function createTeacherOrder(params: {
  teacherUid: string;
  teacherName: string;
  teacherEmail: string;
  items: TeacherOrderItem[];
  delivery: TeacherDeliveryInfo;
  total: number;
  paymentMethod: TeacherOrder["paymentMethod"];
  paymentIntentId?: string;
  skipPayment?: boolean;
}): Promise<string> {
  if (!db) throw new Error("Database not available");

  // Build order in the same shape the POS expects (compatible with AppOrder)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderData: Record<string, unknown> = {
    source: "TEACHER_APP",
    // POS-compatible fields (same as APP orders)
    customerUid: params.teacherUid,
    customerName: params.teacherName,
    customerEmail: params.teacherEmail,
    // Items in same format as APP orders
    items: params.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      qty: item.qty,
      ...(item.modifiers ? { modifiers: item.modifiers } : {}),
      ...(item.isCombo ? { isCombo: true, comboId: item.comboId } : {}),
      ...(item.slotChoices ? { slotChoices: item.slotChoices } : {}),
    })),
    total: params.total,
    status: "CREATED", // Same initial status as APP orders so POS picks them up
    paymentMethod: "CARD",
    paymentStatus: params.skipPayment ? "SKIPPED" : "PAID",
    // Teacher-specific fields
    teacherUid: params.teacherUid,
    teacherName: params.teacherName,
    teacherEmail: params.teacherEmail,
    delivery: params.delivery,
    // Pickup info for POS display
    pickupType: "SCHEDULED",
    pickupTimeLabel: params.delivery.deliveryTime || null,
    notes: params.delivery.notes?.trim() || `Entrega: ${params.delivery.locationDetail} - ${params.delivery.recipientName}`,
    // Payment
    ...(params.paymentIntentId ? { paymentIntentId: params.paymentIntentId } : {}),
    ...(params.skipPayment ? { skipPayment: true } : {}),
    // Timestamps
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, ORDERS_COLLECTION), orderData);
  return docRef.id;
}

// ══════════════════════════════════════
// GET TEACHER'S ORDERS
// ══════════════════════════════════════

export async function getTeacherOrders(uid: string): Promise<TeacherOrder[]> {
  if (!db || !uid) return [];
  try {
    // Must filter by customerUid (not teacherUid) to satisfy Firestore security rules
    // which require: resource.data.customerUid == request.auth.uid
    const q = query(
      collection(db, ORDERS_COLLECTION),
      where("source", "==", "TEACHER_APP"),
      where("customerUid", "==", uid)
    );
    const snap = await getDocs(q);
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeacherOrder));
    // Sort client-side to avoid needing composite index
    orders.sort((a, b) => {
      const ta = toMillis(a.createdAt);
      const tb = toMillis(b.createdAt);
      return tb - ta;
    });
    return orders;
  } catch (err) {
    console.error("[TeacherOrder] Error fetching orders:", err);
    return [];
  }
}

// ══════════════════════════════════════
// REAL-TIME LISTENER FOR TEACHER ORDERS
// ══════════════════════════════════════

export function listenTeacherOrders(
  uid: string,
  callback: (orders: TeacherOrder[]) => void
): () => void {
  if (!db || !uid) return () => {};

  // Must filter by customerUid (not teacherUid) to satisfy Firestore security rules
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where("source", "==", "TEACHER_APP"),
    where("customerUid", "==", uid)
  );

  return onSnapshot(q, (snap) => {
    const orders = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as TeacherOrder)
    );
    // Sort client-side
    orders.sort((a, b) => {
      const ta = toMillis(a.createdAt);
      const tb = toMillis(b.createdAt);
      return tb - ta;
    });
    callback(orders);
  });
}
