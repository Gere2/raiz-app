"use client";

import { useState, useMemo } from "react";
import { useCart } from "@/components/cart-provider";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

function generateTimeSlots(): string[] {
  const now = new Date();
  const slots: string[] = [];
  // Redondear al siguiente cuarto de hora + 15min mínimo de preparación
  const minMinutes = now.getHours() * 60 + now.getMinutes() + 15;
  const startMinutes = Math.ceil(minMinutes / 15) * 15;
  // Generar slots hasta las 21:00
  for (let m = startMinutes; m <= 21 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h >= 8 && h <= 21) {
      slots.push(h.toString().padStart(2, "0") + ":" + min.toString().padStart(2, "0"));
    }
  }
  return slots;
}

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const estimatedTotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const timeSlots = useMemo(() => generateTimeSlots(), []);

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
    if (!pickupTime) {
      toast.error("Selecciona una hora de recogida");
      return;
    }
    setSubmitting(true);
    try {
      const total = items.reduce((sum, it) => sum + it.product.price * it.qty, 0);
      await addDoc(collection(db, "orders"), {
        customerName: user.displayName || user.email || "Cliente app",
        notes: notes || "",
        status: "PAYMENT_PENDING",
        total,
        pickupTime,
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
      toast.success("¡Pedido creado! Recogida a las " + pickupTime);
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

      {/* Resumen del pedido */}
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

      {/* Info del cliente */}
      <div className="rounded-xl border border-brand-200 bg-white p-4 text-sm shadow-sm">
        <p><span className="text-brand-500">Pedido para:</span> <span className="font-medium text-brand-900">{user.displayName || user.email}</span></p>
      </div>

      {/* Selector de hora de recogida */}
      <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-semibold text-brand-800">⏰ Hora de recogida</label>
        <p className="mb-3 text-xs text-brand-500">Elige cuándo quieres recoger tu pedido en la barra</p>
        {timeSlots.length === 0 ? (
          <p className="text-sm text-red-500">No hay horarios disponibles hoy. Vuelve mañana.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {timeSlots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setPickupTime(slot)}
                className={
                  "rounded-lg border px-3 py-2 text-sm font-medium transition-all " +
                  (pickupTime === slot
                    ? "border-leaf-600 bg-leaf-600 text-white shadow-sm"
                    : "border-brand-200 text-brand-700 hover:border-leaf-400 hover:bg-leaf-50")
                }
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notas */}
      <div>
        <label className="mb-1 block text-sm font-medium text-brand-800">Notas (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sin azúcar, leche de avena..." className="w-full rounded-xl border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:ring-2 focus:ring-leaf-500 placeholder:text-brand-400" rows={2} />
      </div>

      {/* Botón confirmar */}
      <button onClick={handlePlaceOrder} disabled={submitting || !pickupTime} className="w-full rounded-xl bg-leaf-600 py-3 text-sm font-medium text-white transition-colors hover:bg-leaf-700 disabled:opacity-50">
        {submitting ? "Creando pedido..." : pickupTime ? "Confirmar pedido — Recogida " + pickupTime : "Selecciona hora de recogida"}
      </button>
      <Link href="/cart" className="block text-center text-sm text-brand-500 underline hover:text-brand-700">Volver al carrito</Link>
    </div>
  );
}
