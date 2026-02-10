"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";

type OrderItem = { productId: string; productName: string; unitPrice: number; qty: number };
type OrderDoc = { customerUid?: string; notes?: string | null; status?: string; items?: OrderItem[]; total?: number; createdAt?: any };

function calcTotal(items?: OrderItem[]) {
  if (!items || items.length === 0) return 0;
  return items.reduce((sum, it) => sum + (it.unitPrice || 0) * (it.qty || 0), 0);
}

const STATUS: Record<string, { label: string; color: string }> = {
  PAYMENT_PENDING: { label: "Pendiente de pago", color: "bg-cream-200 text-cream-800" },
  PAID: { label: "Pagado", color: "bg-leaf-100 text-leaf-800" },
  IN_QUEUE: { label: "En cola", color: "bg-blue-100 text-blue-700" },
  PREPARING: { label: "Preparando ☕", color: "bg-brand-100 text-brand-800" },
  READY: { label: "¡Listo para recoger!", color: "bg-leaf-200 text-leaf-900" },
  PICKED_UP: { label: "Recogido", color: "bg-brand-100 text-brand-500" },
  CANCELED: { label: "Cancelado", color: "bg-red-100 text-red-600" },
};

export default function OrdersPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<Array<{ id: string; data: OrderDoc }>>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setPageLoading(false); setOrders([]); return; }
    setPageLoading(true); setErrorMsg(null);
    const q = query(collection(db, "orders"), where("customerUid", "==", user.uid));
    const unsub = onSnapshot(q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, data: d.data() as OrderDoc }))
          .sort((a, b) => (b.data.createdAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? 0));
        setOrders(list); setPageLoading(false);
      },
      (err) => { setErrorMsg(err?.message || "Error"); setPageLoading(false); }
    );
    return () => unsub();
  }, [user, loading]);

  const content = useMemo(() => {
    if (loading || pageLoading) return (
      <div className="flex flex-col items-center py-10 gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
        <p className="text-brand-500">Cargando pedidos...</p>
      </div>
    );
    if (errorMsg) return <p className="py-10 text-center text-red-600">Error: {errorMsg}</p>;
    if (!user) return (
      <div className="py-10 text-center">
        <p className="mb-4 text-brand-500">Inicia sesión para ver tus pedidos</p>
        <a href="/login?redirect=/orders" className="rounded-xl bg-leaf-600 px-4 py-2 text-sm text-white">Iniciar sesión</a>
      </div>
    );
    if (orders.length === 0) return (
      <div className="py-10 text-center">
        <p className="text-3xl mb-2">🌿</p>
        <p className="text-brand-500">Aún no tienes pedidos</p>
        <a href="/" className="mt-3 inline-block rounded-full bg-leaf-600 px-4 py-2 text-sm text-white">Ver la carta</a>
      </div>
    );
    return (
      <div className="space-y-3">
        {orders.map(({ id, data }) => {
          const t = typeof data.total === "number" ? data.total : calcTotal(data.items);
          const s = STATUS[data.status || ""] || { label: data.status || "---", color: "bg-brand-100 text-brand-600" };
          return (
            <div key={id} className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-brand-400">#{id.slice(-6).toUpperCase()}</p>
                  <div className="mt-2 space-y-0.5">
                    {data.items?.map((it, i) => <p key={i} className="text-sm text-brand-700">{it.qty}x {it.productName}</p>)}
                  </div>
                  {data.notes && <p className="mt-2 text-xs text-brand-400">📝 {data.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <span className={"inline-block rounded-full px-2.5 py-1 text-xs font-medium " + s.color}>{s.label}</span>
                  <p className="mt-2 text-sm font-semibold text-leaf-700">{t.toFixed(2)} €</p>
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
      <h1 className="text-2xl font-bold text-brand-900">Mis pedidos</h1>
      {content}
    </div>
  );
}
