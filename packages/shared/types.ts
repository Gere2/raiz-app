export type OrderItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  qty: number;
};

export type AppOrder = {
  id: string;
  source?: "APP" | "POS";
  customerUid?: string;
  customerName?: string;
  customerEmail?: string;
  notes?: string | null;
  items?: OrderItem[];
  total?: number;

  pickupType?: "ASAP" | "SCHEDULED";
  pickupTimeLabel?: string | null;
  pickupAt?: { toMillis?: () => number } | null;

  status?: "CREATED" | "IN_QUEUE" | "PREPARING" | "READY" | "PICKED_UP";
  paymentStatus?: "PENDING" | "PAID";
  createdAt?: { toMillis?: () => number } | null;
  updatedAt?: { toMillis?: () => number } | null;
};
