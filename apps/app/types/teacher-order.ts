import type { Timestamp } from "firebase/firestore";

// ── Teacher Order Types ──

export type TeacherOrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "EN_CAMINO"
  | "DELIVERED"
  | "CANCELLED"
  // POS-compatible statuses (used when orders go to unified "orders" collection)
  | "CREATED"
  | "IN_QUEUE"
  | "READY"
  | "PICKED_UP"
  | "CANCELED";

export type DeliveryLocation = "classroom" | "office" | "sala_reuniones" | "other";

export interface TeacherOrderItem {
  productId: string;
  productName: string;
  unitPrice: number;
  qty: number;
  modifiers?: {
    milk?: string;
  };
  isCombo?: boolean;
  comboId?: string;
  /** Tracks which slot choices the user made inside a combo */
  slotChoices?: { slotLabel: string; choiceName: string }[];
}

export interface TeacherDeliveryInfo {
  location: DeliveryLocation;
  locationDetail: string; // e.g., "Aula 204", "Oficina 3B", "Sala Junta 1"
  deliveryTime: string; // HH:mm format
  deliveryDate: string; // YYYY-MM-DD format
  recipientName: string; // A nombre de...
  department?: string; // Departamento que paga
  attendees?: number; // Número de asistentes (for meeting combos)
  contactPhone?: string;
  notes?: string;
}

export interface TeacherOrder {
  id: string;
  source: "TEACHER_APP";
  teacherUid: string;
  teacherName: string;
  teacherEmail: string;
  items: TeacherOrderItem[];
  delivery: TeacherDeliveryInfo;
  total: number;
  status: TeacherOrderStatus;
  paymentMethod: "cuenta_departamento" | "efectivo" | "tarjeta";
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// ── Meeting Combo Types (v2 – Mini Combos with choices) ──

/**
 * A slot is a "choose one" within a combo.
 * e.g. slot "Bebida" with options ["Café americano", "Café con leche", "Té"]
 */
export interface ComboSlot {
  label: string;       // "Bebida", "Snack", etc.
  label_en?: string;   // "Drink", "Snack"
  category: "beverage" | "food" | "snack";
  options: ComboSlotOption[];
  quantity: number;     // how many of this slot per combo (e.g., 2 drinks, 1 snack)
}

export interface ComboSlotOption {
  name: string;
  name_en?: string;
  productId?: string;   // optional link to products collection
  extraPrice?: number;  // 0 by default, e.g. +0.50 for oat milk upgrade
}

export interface MeetingCombo {
  id: string;
  name: string;
  name_en?: string;
  description: string;
  description_en?: string;
  basePrice: number;       // base price of the combo
  servesUpTo: number;      // 2-3 for mini combos
  slots: ComboSlot[];      // the customizable slots
  imageUrl?: string;
  available: boolean;
  popular?: boolean;
  order?: number;
  createdAt?: Timestamp | Date;
  /** @deprecated – old field, kept for backward compat */
  price?: number;
  /** @deprecated */
  items?: ComboItem[];
}

/** @deprecated – use ComboSlot instead */
export interface ComboItem {
  productId?: string;
  name: string;
  quantity: number;
  category: "beverage" | "food" | "snack";
}

// ── Custom Combo Builder ──

export interface CustomComboSelection {
  beverages: { productId: string; name: string; qty: number; price: number }[];
  food: { productId: string; name: string; qty: number; price: number }[];
  attendees: number;
}
