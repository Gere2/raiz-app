"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";

type OrderItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  qty: number;
};

type OrderDoc = {
  customerUid?: string;
  customerName?: string;
  notes?: string | null;
  status?: string;
  source?: string;
  items?: OrderItem[];
  total?: number;
  createdAt?: any;
  updatedAt?: any;
};

function calcTotal(items?: OrderItem[]) {
  if (!items || items.length === 0) return 0;
  return items.reduce((sum, it) => sum + (it.unitPrice || 0) * (it.qty || 0), 0);
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PAYMENT_PENDING: { label: "Pendiente de pago", color: "bg-yellow-100 text-yellow-700" },
  PAID: { label: "Pagado", color: "bg-green-100 text-green-700" },
  IN_QUEUE: { label: "En cola", color: "bg-blue-100 text-blue-700" },
  PREPARING: { label: "Preparando", color: "bg-orange-100 text-orange-700" },
  READY: { label: "Listo para recoger!", color: "bg-emerald-100 text-emerald-700" },
  PICKED_UP: { label: "Recogido", color: "bg-gray-100 text-gray-500" },
  CANCELED: { label: "Cancelado", color: "bg-red-100 text-red-600" },
};

export default function OrdersPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<Array<{ id: string; data: OrderDoc }>>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setPageLoading(false);
      setOrders([]);
      return;
    }

    setPageLoading(true);
    setErrorMsg(null);

    // Query simple: solo 1 where, sin orderBy = no necesita indice compuesto
    const q = query(collection(db, "orders"), where("customerUid", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, data: d.data() as OrderDoc }))
          // Ordenar en cliente para evitar indices
          .sort((a, b) => {
            const ta = a.data.createdAt?.toMillis?.() ?? 0;
            const tb = b.data.createdAt?.toMillis?.() ?? 0;
            return tb - ta;
          });
        setOrders(list);
        setPageLoading(false);
      },
      (err) => {
        console.error("Error en orders query:", err);
        setErrorMsg(err?.message || "Error cargando pedidos");
        setPageLoading(false);
      }
    );

    return () => unsub();
  }, [user, loading]);

  const content = useMemo(() => {
    if (loading || pageLoading) {
      return <p className="py-10 text-center text-gray-500">Cargando pedidos...</p>;
    }
    if (errorMsg) {
      return <p className="py-10 text-center text-red-600">Error: {errorMsg}</p>;
    }
    if (!user) {
      return (
        <div className="py-10 text-center">
          <p className="mb-4 text-gray-500">Inicia sesion para ver tus pedidos</p>
          <a href="/login?redirect=/orders" className="rounded-lg bg-black px-4 py-2 text-sm text-white">Iniciar sesion</a>
        </div>
      );
    }
    if (orders.length === 0) {
      return (
        <div className="py-10 text-center">
          <p className="text-gray-500">Aun no tienes pedidos</p>
          <a href="/" className="mt-2 inline-block text-sm underline">Ver la carta</a>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {orders.map(({ id, data }) => {
          const computedTotal = typeof data.total === "number" ? data.total : calcTotal(data.items);
          const statusInfo = STATUS_LABELS[data.status || ""] || { label: data.status || "---", color: "bg-gray-100 text-gray-600" };

          return (
            <div key={id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-400">#{id.slice(-6).toUpperCase()}</p>
                  <div className="mt-2 space-y-0.5">
                    {data.items?.map((it, i) => (
                      <p key={i} className="text-sm">{it.qty}x {it.productName}</p>
                    ))}
                  </div>
                  {data.notes && <p className="mt-2 text-xs text-gray-400">{data.notes}</p>}
                </div>
                <div className="text-right">
                  <span className={"inline-block rounded-full px-2.5 py-1 text-xs font-medium " + statusInfo.color}>{statusInfo.label}</span>
                  <p className="mt-2 text-sm font-semibold">{computedTotal.toFixed(2)} EUR</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [loading, pageLoading, errorMsg, user, orders]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mis pedidos</h1>
      {content}
    </div>
  );
}
