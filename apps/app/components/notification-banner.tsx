"use client"
import { useEffect, useState } from "react"; import { collection, onSnapshot, query, where } from "firebase/firestore"; import { db } from "@/lib/firebase"; import { useAuth } from "@/components/auth-provider"; import { useLanguage } from "@/components/language-provider"; import Link from "next/link"

export function NotificationBanner() {
  const { user } = useAuth(); const { t } = useLanguage(); const [readyOrders, setReadyOrders] = useState<{ id: string }[]>([]); const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, "orders"), where("customerUid", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setReadyOrders(snap.docs.filter((d) => d.data().status === "READY").map((d) => ({ id: d.id })))
    }, (error) => {
      console.error("Error listening to orders:", error)
    })
    return () => unsub()
  }, [user])
  const visible = readyOrders.filter((o) => !dismissed.has(o.id)); if (visible.length === 0) return null
  return (
    <div className="fixed top-14 left-0 right-0 z-50 px-4 pt-2">{visible.map((order) => (
      <div key={order.id} className="mx-auto max-w-lg animate-fade-up"><div className="flex items-center gap-3 rounded-2xl bg-leaf-600 p-3 shadow-xl shadow-leaf-600/20">
        <span className="text-2xl status-pulse">🔔</span><div className="flex-1 min-w-0"><p className="text-sm font-bold text-white">{t("notif.ready")}</p><p className="text-xs text-leaf-100 truncate">{t("notif.pickup")}</p></div>
        <div className="flex items-center gap-2 shrink-0"><Link href="/orders" className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-leaf-700">{t("notif.view")}</Link><button onClick={() => setDismissed((p) => new Set(p).add(order.id))} className="flex h-7 w-7 items-center justify-center rounded-full text-leaf-200 hover:text-white hover:bg-leaf-500">✕</button></div>
      </div></div>))}</div>
  )
}
