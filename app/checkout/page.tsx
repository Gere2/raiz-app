"use client";

import { useState } from "react";
import { useCart } from "@/components/cart-provider";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const estimatedTotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);

  if (!user) { router.push("/login?redirect=/checkout"); return null; }
  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-brand-600">No tienes nada en el carrito</p>
        <Link href="/" className="mt-4 inline-block rounded-full bg-leaf-600 px-4 py-2 text-sm text-white">Ver la carta</Link>
      </div>
    );
  }

  const handlePlaceOrder = async () => {
    setSubmitting(true);
    try {
      const total = items.reduce((sum, it) => sum + it.product.price * it.qty, 0);
      await addDoc(collection(db, "orders"), {
        customerName: user.displayName || user.email || "Cliente app",
        notes: notes || "",
        status: "PAYMENT_PENDING",
        total,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: "app",
        customerEmail: user.email,
        customerUid: user.uid,
        items: items.map((it) => ({
          productId: it.product.id,
          productName: it.product.name,
          unitPrice: it.product.price,
          qty: it.qty,
          notes: it.notes || "",
        })),
      });
      toast.success("¡Pedido creado! Pendiente de pago.");
      clearCart();
      router.push("/orders");
    } catch (error) {
      console.error("Error creando pedido:", error);
      toast.error("Error al crear el pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">Confirmar pedido</h1>
      <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-brand-800">Tu pedido</h2>
        {items.map((item) => (
          <div key={item.product.id} className="flex justify-between py-1.5 text-sm">
            <span className="text-brand-700">{item.qty}x {item.product.name}</span>
            <span className="text-brand-500">{(item.product.price * item.qty).toFixed(2)} €</span>
          </div>
        ))}
        <div className="mt-3 flex justify-between border-t border-brand-200 pt-3 font-semibold">
          <span className="text-brand-900">Total</span>
          <span className="text-leaf-700">{estimatedTotal.toFixed(2)} €</span>
        </div>
      </div>
      <div className="rounded-xl border border-brand-200 bg-white p-4 text-sm shadow-sm">
        <p><span className="text-brand-500">Pedido para:</span> <span className="font-medium text-brand-900">{user.displayName || user.email}</span></p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-brand-800">Notas (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sin azúcar, leche de avena..." className="w-full rounded-xl border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:ring-2 focus:ring-leaf-500 placeholder:text-brand-400" rows={2} />
      </div>
      <button onClick={handlePlaceOrder} disabled={submitting} className="w-full rounded-xl bg-leaf-600 py-3 text-sm font-medium text-white transition-colors hover:bg-leaf-700 disabled:opacity-50">
        {submitting ? "Creando pedido..." : "Confirmar y pagar"}
      </button>
      <Link href="/cart" className="block text-center text-sm text-brand-500 underline hover:text-brand-700">Volver al carrito</Link>
    </div>
  );
}
