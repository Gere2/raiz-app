"use client";
import { useEffect, useState, useCallback } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import { useCart } from "@/components/cart-provider";
import { useLanguage } from "@/components/language-provider";
import { translateProduct } from "@/lib/i18n/product-translations";
import { ORDER_STATUS } from "@/types/index";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  StatusIcon,
  ClipboardList,
  Leaf,
  FileText,
  Bell,
  AlertCircle,
} from "@/lib/icons"

type OrderItem = { productId: string; productName: string; unitPrice: number; qty: number }
type OrderDoc = { customerUid?: string; notes?: string|null; status?: string; items?: OrderItem[]; total?: number; pickupType?: string; pickupTimeLabel?: string|null; paymentMethod?: string; paymentStatus?: string; createdAt?: { toMillis?: () => number }|null }

interface StatusIconProps {
  status: string
  className?: string
}

function calcTotal(items?: OrderItem[]) { return items?.reduce((s, i) => s + (i.unitPrice||0) * (i.qty||0), 0) ?? 0 }
const STATUS_STEPS = [ORDER_STATUS.CREATED, ORDER_STATUS.IN_QUEUE, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.PICKED_UP]

export default function OrdersPage() {
  const { user, loading } = useAuth(); const { locale, t } = useLanguage()
  const [orders, setOrders] = useState<Array<{ id: string; data: OrderDoc }>>([]); const [pageLoading, setPageLoading] = useState(true); const [error, setError] = useState<string|null>(null)

  const statusConfig = (status: string) => {
    const map: Record<string, { icon: React.ComponentType<StatusIconProps>; color: string; bgCard: string }> = {
      [ORDER_STATUS.CREATED]: { icon: ClipboardList, color: "text-violet-700", bgCard: "border-violet-200 bg-violet-50/50" },
      [ORDER_STATUS.IN_QUEUE]: { icon: StatusIcon, color: "text-blue-700", bgCard: "border-blue-200 bg-blue-50/50" },
      [ORDER_STATUS.PREPARING]: { icon: StatusIcon, color: "text-amber-700", bgCard: "border-amber-200 bg-amber-50/50" },
      [ORDER_STATUS.READY]: { icon: Bell, color: "text-leaf-700", bgCard: "border-leaf-400 bg-leaf-50 ring-2 ring-leaf-300" },
      [ORDER_STATUS.PICKED_UP]: { icon: StatusIcon, color: "text-brand-400", bgCard: "border-brand-200 bg-brand-50/30" },
      [ORDER_STATUS.CANCELED]: { icon: StatusIcon, color: "text-red-500", bgCard: "border-red-200 bg-red-50/30" },
    }
    return { label: t(`status.${status}`) || status, ...(map[status] || { icon: AlertCircle, color: "text-brand-500", bgCard: "border-brand-200" }) }
  }

  const timeAgo = useCallback((ms: number): string => {
    const diff = Date.now() - ms; const mins = Math.floor(diff / 60000)
    if (mins < 1) return t("orders.now")
    if (mins < 60) return `${t("orders.ago")} ${mins} ${t("orders.min")}`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${t("orders.ago")} ${hours} ${t("orders.h")}`
    return `${t("orders.ago")} ${Math.floor(hours / 24)} ${t("orders.d")}`
  }, [t])

  useEffect(() => {
    if (loading) return; if (!user) { setPageLoading(false); setOrders([]); return }
    setPageLoading(true); const q = query(collection(db, "orders"), where("customerUid", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => { setOrders(snap.docs.map((d) => ({ id: d.id, data: d.data() as OrderDoc })).sort((a, b) => (b.data.createdAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? 0))); setPageLoading(false); setError(null) }, () => { setError(t("orders.error") || "No se pudieron cargar tus pedidos. Comprueba tu conexión."); setPageLoading(false) })
    return () => unsub()
  }, [user, loading, t])

  if (loading || pageLoading) return <div className="flex flex-col items-center py-16 gap-3"><div className="relative"><div className="h-10 w-10 rounded-full border-[3px] border-brand-200" /><div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-[3px] border-transparent border-t-leaf-600" /></div><p className="text-sm text-brand-400">{t("orders.loading")}</p></div>
  if (error) return <div className="flex flex-col items-center py-20 gap-4 animate-fade-up"><div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50"><AlertCircle className="h-10 w-10 text-red-600" /></div><div className="text-center"><p className="text-lg font-semibold text-brand-800">{t("orders.error.title") || "Error cargando pedidos"}</p><p className="mt-1 text-sm text-brand-400">{error}</p></div><button onClick={() => window.location.reload()} className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-leaf-700">{t("orders.error.retry") || "Reintentar"}</button></div>
  if (!user) return <div className="flex flex-col items-center py-20 gap-4 animate-fade-up"><div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-100"><ClipboardList className="h-10 w-10 text-violet-600" /></div><p className="text-brand-500">{t("orders.signin")}</p><Link href="/login?redirect=/orders" className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm font-medium text-white">{t("header.signin")}</Link></div>
  if (orders.length === 0) return <div className="flex flex-col items-center py-20 gap-4 animate-fade-up"><div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-100"><Leaf className="h-10 w-10 text-leaf-600" /></div><div className="text-center"><p className="text-lg font-semibold text-brand-800">{t("orders.empty.title")}</p><p className="mt-1 text-sm text-brand-400">{t("orders.empty.subtitle")}</p></div><Link href="/" className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm font-medium text-white">{t("orders.empty.cta")}</Link></div>

  const active = orders.filter((o) => o.data.status !== ORDER_STATUS.PICKED_UP && o.data.status !== ORDER_STATUS.CANCELED)
  const past = orders.filter((o) => o.data.status === ORDER_STATUS.PICKED_UP || o.data.status === ORDER_STATUS.CANCELED)

  return (
    <div className="space-y-6 animate-fade-up">
      <h1 className="text-xl font-bold text-brand-900">{t("orders.title")}</h1>
      {active.length > 0 && <div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wider text-leaf-700">{t("orders.active")}</p>{active.map(({ id, data }) => <OrderCard key={id} id={id} data={data} showRepeat={false} statusConfig={statusConfig} timeAgo={timeAgo} locale={locale} t={t} />)}</div>}
      {past.length > 0 && <div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wider text-brand-400">{t("orders.previous")}</p>{past.map(({ id, data }) => <OrderCard key={id} id={id} data={data} showRepeat={true} statusConfig={statusConfig} timeAgo={timeAgo} locale={locale} t={t} />)}</div>}
    </div>
  )
}

function OrderCard({ id, data, showRepeat, statusConfig, timeAgo, locale, t }: { id: string; data: OrderDoc; showRepeat: boolean; statusConfig: (s: string) => { label: string; icon?: React.ComponentType<StatusIconProps>; color?: string; bgCard?: string }; timeAgo: (ms: number) => string; locale: "es"|"en"; t: (k: string) => string }) {
  const { addItemDirect } = useCart(); const router = useRouter()
  const isEn = locale === "en"
  const s = statusConfig(data.status || ""); const total = typeof data.total === "number" ? data.total : calcTotal(data.items)
  const isReady = data.status === ORDER_STATUS.READY; const isDone = data.status === ORDER_STATUS.PICKED_UP || data.status === ORDER_STATUS.CANCELED
  const stepIndex = STATUS_STEPS.indexOf((data.status || "") as typeof STATUS_STEPS[number]); const isCash = data.paymentMethod === "CASH"
  const validStepIndex = stepIndex >= 0 ? stepIndex : -1

  const handleRepeat = async () => {
    if (!data.items?.length) return;

    // Validate that products still exist in catalog
    const { collection, query, where, getDocs } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");

    try {
      const productIds = data.items.map(i => i.productId);

      // SECURITY: Batch product queries in groups of 10 (Firestore "in" limit)
      const chunks = [];
      for (let i = 0; i < productIds.length; i += 10) {
        chunks.push(productIds.slice(i, i + 10));
      }

      const allProductDocs = (await Promise.all(
        chunks.map(chunk =>
          getDocs(query(
            collection(db, "products"),
            where("__name__", "in", chunk)
          ))
        )
      )).flatMap(snap => snap.docs);

      const existingIds = new Set(allProductDocs.map(d => d.id));

      // Filter out items that no longer exist
      const validItems = data.items.filter(item => existingIds.has(item.productId));
      const unavailable = data.items.filter(item => !existingIds.has(item.productId));

      if (unavailable.length > 0) {
        const unavailableNames = unavailable.map(i => i.productName).join(", ");
        toast.error(
          isEn
            ? `Not available: ${unavailableNames}`
            : `No disponibles: ${unavailableNames}`,
          { duration: 3000 }
        );
      }

      // Add only available items to cart
      validItems.forEach((item) => {
        addItemDirect({ id: item.productId, name: item.productName, price: item.unitPrice }, item.qty);
      });

      if (validItems.length > 0) {
        toast.success(t("orders.reorder.toast"), { duration: 2000 });
        router.push("/cart");
      }
    } catch (error) {
      console.error("Error repeating order:", error);
      // Fallback: add items without validation
      data.items.forEach((item) => {
        addItemDirect({ id: item.productId, name: item.productName, price: item.unitPrice }, item.qty);
      });
      toast.success(t("orders.reorder.toast"), { duration: 2000 });
      router.push("/cart");
    }
  }

  return (
    <div className={`rounded-2xl border-2 p-4 transition-all ${s.bgCard} ${isReady ? "shadow-lg shadow-leaf-200/50" : ""}`}>
      {isReady && <div className="mb-3 flex items-center gap-2 rounded-xl bg-leaf-600 px-3 py-2.5 text-white"><Bell className="h-5 w-5 status-pulse" /><div><p className="text-sm font-bold">{t("orders.ready.title")}</p><p className="text-xs text-leaf-100">{t("orders.ready.subtitle")}</p></div></div>}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-brand-400">#{id.slice(-6).toUpperCase()}</span>
            <span className={`text-xs font-semibold flex items-center gap-1.5 ${s.color}`} aria-label={`${t("orders.status")}: ${s.label}`}>{s.icon && <s.icon status={data.status || ""} className="h-4 w-4" aria-hidden="true" />} {s.label}</span>
            {isCash && <span className="text-xs font-medium text-amber-600 bg-amber-100 rounded-md px-1.5 py-0.5">{t("orders.cash")}</span>}
            {!isCash && data.paymentStatus === "PAID" && <span className="text-xs font-medium text-green-600 bg-green-100 rounded-md px-1.5 py-0.5">{t("orders.paid")}</span>}
          </div>
          {data.createdAt?.toMillis && <p className="text-[11px] text-brand-300 mt-0.5">{timeAgo(data.createdAt.toMillis())}</p>}
        </div>
        <span className="text-base font-bold text-brand-800 tabular-nums">{total.toFixed(2)} €</span>
      </div>
      {!isDone && validStepIndex >= 0 && <div className="mt-3 flex gap-1">{STATUS_STEPS.slice(0, -1).map((step, i) => <div key={step} className={`h-1.5 flex-1 rounded-full transition-all ${data.status === ORDER_STATUS.CANCELED ? (i <= validStepIndex ? "bg-red-300" : "bg-red-100") : (i <= validStepIndex ? (isReady ? "bg-leaf-500" : "bg-leaf-400") : "bg-brand-200/60")}`} />)}</div>}
      {isDone && data.status === ORDER_STATUS.CANCELED && <div className="mt-3 w-full h-1.5 rounded-full bg-red-300" />}
      <div className="mt-3 space-y-0.5">{data.items?.map((it, i) => <p key={`${it.productId}-${i}`} className="text-sm text-brand-700"><span className="font-medium">{it.qty}×</span> {translateProduct(it.productName, locale)}</p>)}</div>
      {data.pickupType && <p className="mt-2 text-xs text-brand-500">{data.pickupType === "ASAP" ? t("orders.asap") : `${t("orders.scheduled")} ${data.pickupTimeLabel || ""}`}</p>}
      {data.notes && <p className="mt-1 text-xs text-brand-400 italic flex items-center gap-1.5"><FileText className="h-3 w-3" /> {data.notes}</p>}
      {showRepeat && data.items && data.items.length > 0 && <button onClick={handleRepeat} className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 py-2.5 text-sm font-medium text-brand-600 transition-all hover:border-leaf-400 hover:text-leaf-700 hover:bg-leaf-50 active:scale-[0.98]">{t("orders.reorder")}</button>}
    </div>
  )
}
