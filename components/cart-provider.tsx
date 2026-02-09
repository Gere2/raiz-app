"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { Product, CartItem } from "@/types";

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, notes?: string) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  totalItems: number;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQty: () => {},
  clearCart: () => {},
  totalItems: 0,
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (product: Product, notes?: string) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1, notes }];
    });
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) { removeItem(productId); return; }
    setItems((prev) =>
      prev.map((item) => item.product.id === productId ? { ...item, qty } : item)
    );
  };

  const clearCart = () => setItems([]);
  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalItems }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
