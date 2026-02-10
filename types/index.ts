export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  origin?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CartItem {
  product: Product;
  qty: number;
  notes?: string;
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
	pickupType?: "ASAP" | "SCHEDULED";
	pickupAt?: any;
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
  paidAt?: any;
  createdAt: any;
  updatedAt: any;
}

export interface Category {
  id: string;
  name: string;
}
