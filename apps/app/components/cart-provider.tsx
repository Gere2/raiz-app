"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Product, CartItem, CartItemModifiers } from "@/types";
import { toast } from "sonner";

const CART_STORAGE_KEY = "raiz-cart";

/** Genera una key única para un item: producto + tipo de leche */
function cartItemKey(productId: string, modifiers?: CartItemModifiers): string {
  const milk = modifiers?.milk || "none";
  return `${productId}::${milk}`;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, notes?: string, modifiers?: CartItemModifiers) => void;
  addItemDirect: (product: { id: string; name: string; price: number }, qty?: number) => void;
  removeItem: (itemKey: string, showNotification?: boolean) => void;
  updateQty: (itemKey: string, qty: number, showNotification?: boolean) => void;
  clearCart: () => void;
  totalItems: number;
  getItemKey: (item: CartItem) => string;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  addItemDirect: () => {},
  removeItem: () => { },
  updateQty: () => { },
  clearCart: () => {},
  totalItems: 0,
  getItemKey: () => "",
});

/** Load cart from localStorage (safe for SSR) */
function loadSavedCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Corrupted data — ignore
  }
  return [];
}

/** Persist cart to localStorage */
function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      localStorage.removeItem(CART_STORAGE_KEY);
    } else {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Storage full or blocked — ignore
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (client-side only)
  useEffect(() => {
    setItems(loadSavedCart());
    setHydrated(true);
  }, []);

  // Persist to localStorage on change (skip initial server render)
  useEffect(() => {
    if (hydrated) {
      saveCart(items);
    }
  }, [items, hydrated]);

  const getItemKey = useCallback((item: CartItem) => cartItemKey(item.product.id, item.modifiers), []);

  const addItem = useCallback((product: Product, notes?: string, modifiers?: CartItemModifiers) => {
    const key = cartItemKey(product.id, modifiers);
    setItems((prev) => {
      const existing = prev.find((item) => cartItemKey(item.product.id, item.modifiers) === key);
      if (existing) {
        return prev.map((item) =>
          cartItemKey(item.product.id, item.modifiers) === key ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1, notes, modifiers }];
    });
  }, []);

  /** Add item by minimal product info (for repeating orders) */
  const addItemDirect = useCallback((product: { id: string; name: string; price: number }, qty: number = 1) => {
    // Validate price is positive and quantity is valid
    if (product.price <= 0 || qty <= 0) {
      console.warn('Invalid price or quantity:', { price: product.price, qty });
      return;
    }
    const fullProduct: Product = {
      id: product.id,
      name: product.name,
      price: product.price,
      category: "",
      origin: "",
      available: true,
    };
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + qty } : item
        );
      }
      return [...prev, { product: fullProduct, qty }];
    });
  }, []);

  const removeItem = useCallback((itemKey: string, showNotification: boolean = true) => {
    setItems((prev) => {
      const item = prev.find((i) => cartItemKey(i.product.id, i.modifiers) === itemKey);
      const updated = prev.filter((i) => cartItemKey(i.product.id, i.modifiers) !== itemKey);
      if (showNotification && item) {
        const productName = item.product.name;
        toast.info(`${productName} removed from cart`, { duration: 2000 });
      }
      return updated;
    });
  }, []);

  const updateQty = useCallback((itemKey: string, qty: number, showNotification: boolean = true) => {
    if (qty <= 0) {
      removeItem(itemKey, showNotification);
      return;
    }
    setItems((prev) =>
      prev.map((item) => cartItemKey(item.product.id, item.modifiers) === itemKey ? { ...item, qty } : item)
    );
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);
  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);

  // Stabilize the context value to prevent unnecessary re-renders
  const contextValue = {
    items,
    addItem,
    addItemDirect,
    removeItem,
    updateQty,
    clearCart,
    totalItems,
    getItemKey,
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
