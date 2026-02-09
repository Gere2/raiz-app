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
        <p className="mb-4 text-xl">Cart is empty</p>
        <p className="text-gray-500">Tu carrito est\u00e1 vac\u00edo</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">Ver la carta</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tu carrito</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.product.id} className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex-1">
              <p className="font-medium">{item.product.name}</p>
              <p className="text-sm text-gray-500">{item.product.price.toFixed(2)} &euro; / ud</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateQty(item.product.id, item.qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border text-sm">-</button>
              <span className="w-6 text-center font-medium">{item.qty}</span>
              <button onClick={() => updateQty(item.product.id, item.qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border text-sm">+</button>
              <button onClick={() => removeItem(item.product.id)} className="ml-2 text-xs text-red-500">Quitar</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-lg font-semibold">Total estimado</span>
        <span className="text-lg font-bold">{estimatedTotal.toFixed(2)} &euro;</span>
      </div>
      <div className="space-y-2">
        <button onClick={() => user ? router.push("/checkout") : router.push("/login?redirect=/checkout")} className="w-full rounded-lg bg-black py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800">
          {user ? "Continuar al pago" : "Iniciar sesi\u00f3n para pagar"}
        </button>
        <button onClick={clearCart} className="w-full rounded-lg border py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50">Vaciar carrito</button>
      </div>
    </div>
  );
}
