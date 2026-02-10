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
        <p className="text-gray-500">No tienes nada en el carrito</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">Ver la carta</Link>
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
      toast.success("Pedido creado! Pendiente de pago.");
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
      <h1 className="text-2xl font-bold">Confirmar pedido</h1>
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Tu pedido</h2>
        {items.map((item) => (
          <div key={item.product.id} className="flex justify-between py-1.5 text-sm">
            <span>{item.qty}x {item.product.name}</span>
            <span className="text-gray-500">{(item.product.price * item.qty).toFixed(2)} EUR</span>
          </div>
        ))}
        <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
          <span>Total estimado</span>
          <span>{estimatedTotal.toFixed(2)} EUR</span>
        </div>
      </div>
      <div className="rounded-lg border p-4 text-sm">
        <p><span className="text-gray-500">Pedido para:</span> {user.displayName || user.email}</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Notas (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sin az\u00facar, leche de avena..." className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" rows={2} />
      </div>
      <button onClick={handlePlaceOrder} disabled={submitting} className="w-full rounded-lg bg-black py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50">
        {submitting ? "Creando pedido..." : "Confirmar y pagar"}
      </button>
      <Link href="/cart" className="block text-center text-sm text-gray-500 underline">Volver al carrito</Link>
    </div>
  );
}
