"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import { AppOrder, AppOrderStatus } from "@/types";
import Link from "next/link";

const STATUS_LABELS: Record<AppOrderStatus, { label: string; color: string }> = {
  PAYMENT_PENDING: { label: "Pendiente de pago", color: "bg-yellow-100 text-yellow-700" },
  PAID: { label: "Pagado", color: "bg-green-100 text-green-700" },
  IN_QUEUE: { label: "En cola", color: "bg-blue-100 text-blue-700" },
  PREPARING: { label: "Preparando", color: "bg-orange-100 text-orange-700" },
  READY: { label: "Listo para recoger!", color: "bg-emerald-100 text-emerald-700" },
  PICKED_UP: { label: "Recogido", color: "bg-gray-100 text-gray-500" },
  CANCELED: { label: "Cancelado", color: "bg-red-100 text-red-600" },
};

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "orders"),
      where("source", "==", "app"),
      where("customerUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as AppOrder[];
      setOrders(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-gray-500">Cargando pedidos...</p></div>;
  }
  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-gray-500">Inicia sesi\u00f3n para ver tus pedidos</p>
        <Link href="/login?redirect=/orders" className="rounded-lg bg-black px-4 py-2 text-sm text-white">Iniciar sesi\u00f3n</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mis pedidos</h1>
      {orders.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-gray-500">A\u00fan no tienes pedidos</p>
          <Link href="/" className="mt-2 inline-block text-sm underline">Ver la carta</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.PAYMENT_PENDING;
            return (
              <div key={order.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-400">#{order.id.slice(-6).toUpperCase()}</p>
                    <div className="mt-1 space-y-0.5">
                      {order.items?.map((item, i) => <p key={i} className="text-sm">{item.qty}x {item.productName}</p>)}
                    </div>
                    {order.notes && <p className="mt-1 text-xs text-gray-400">{order.notes}</p>}
                  </div>
                  <span className={"rounded-full px-2.5 py-1 text-xs font-medium " + statusInfo.color}>{statusInfo.label}</span>
                </div>
                {order.total && <p className="mt-2 text-right text-sm font-semibold">{order.total.toFixed(2)} EUR</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
