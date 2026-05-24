import type { Timestamp } from "firebase/firestore";

export interface Product {
  id: string;
  name: string;
  name_en?: string;
  price: number;
  category: string;
  origin?: string;
  available?: boolean;
  imageUrl?: string;
  description?: string;
  description_en?: string;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export type MilkOption = "normal" | "sin-lactosa" | "almendras" | "avena";

export interface CartItemModifiers {
  milk?: MilkOption;
}

export interface CartItem {
  product: Product;
  qty: number;
  notes?: string;
  modifiers?: CartItemModifiers;
}

export type AppOrderStatus =
  | "PAYMENT_PENDING"
  | "PAID"
  | "IN_QUEUE"
  | "PREPARING"
  | "READY"
  | "PICKED_UP"
  | "CANCELED";

export interface AppOrderItem {
  productId: string;
  productName: string;
  qty: number;
  notes?: string;
  modifiers?: CartItemModifiers;
	pickupType?: "ASAP" | "SCHEDULED";
	pickupAt?: Timestamp | Date;
	pickupTimeLabel?: string | null;
}

export interface AppOrder {
  id: string;
  source: "app";
  customerName: string;
  customerEmail: string;
  customerUid: string;
  status: AppOrderStatus;
  items: AppOrderItem[];
  total?: number;
  notes?: string;
  paymentProvider?: string;
  paymentId?: string;
  paidAt?: Timestamp | Date;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface Category {
  id: string;
  name: string;
  name_en?: string;
  emoji?: string;
  order?: number;
}

/**
 * Order status constants for type-safe status comparisons.
 * Use these instead of string literals to avoid typos and enable refactoring.
 */
export const ORDER_STATUS = {
  CREATED: "CREATED",
  IN_QUEUE: "IN_QUEUE",
  PREPARING: "PREPARING",
  READY: "READY",
  PICKED_UP: "PICKED_UP",
  CANCELED: "CANCELED",
  PAID: "PAID",
  PAYMENT_PENDING: "PAYMENT_PENDING",
} as const;

export type OrderStatusKey = keyof typeof ORDER_STATUS;
