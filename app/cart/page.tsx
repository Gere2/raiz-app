"use client";

import { useCart } from "@/components/cart-provider";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CartPage() {
  const { items, updateQty, removeItem, clearCart } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const estimatedTotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);

  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-4xl mb-3">🛒</p>
        <p className="text-brand-600">Tu carrito está vacío</p>
        <Link href="/" className="mt-4 inline-block rounded-full bg-leaf-600 px-4 py-2 text-sm text-white hover:bg-leaf-700">Ver la carta</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">Tu carrito</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.product.id} className="flex items-center justify-between rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
            <div className="flex-1">
              <p className="font-medium text-brand-900">{item.product.name}</p>
              <p className="text-sm text-brand-500">{item.product.price.toFixed(2)} € / ud</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateQty(item.product.id, item.qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-300 text-brand-700 text-sm hover:bg-brand-100">−</button>
              <span className="w-6 text-center font-medium text-brand-900">{item.qty}</span>
              <button onClick={() => updateQty(item.product.id, item.qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-300 text-brand-700 text-sm hover:bg-brand-100">+</button>
              <button onClick={() => removeItem(item.product.id)} className="ml-2 text-xs text-red-500 hover:text-red-700">Quitar</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-xl bg-brand-100 p-4">
        <span className="text-lg font-semibold text-brand-900">Total estimado</span>
        <span className="text-lg font-bold text-leaf-700">{estimatedTotal.toFixed(2)} €</span>
      </div>
      <div className="space-y-2">
        <button onClick={() => user ? router.push("/checkout") : router.push("/login?redirect=/checkout")} className="w-full rounded-xl bg-leaf-600 py-3 text-sm font-medium text-white transition-colors hover:bg-leaf-700">
          {user ? "Continuar al pago" : "Iniciar sesión para pagar"}
        </button>
        <button onClick={clearCart} className="w-full rounded-xl border border-brand-300 py-2 text-sm text-brand-600 transition-colors hover:bg-brand-100">Vaciar carrito</button>
      </div>
    </div>
  );
}
