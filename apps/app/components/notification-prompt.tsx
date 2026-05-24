"use client"
import { useEffect, useState } from "react"; import { useAuth } from "@/components/auth-provider"; import { useLanguage } from "@/components/language-provider"; import { requestNotificationPermission } from "@/hooks/use-order-notifications"

export function NotificationPrompt() {
  const { user } = useAuth(); const { t } = useLanguage(); const [show, setShow] = useState(false)
  useEffect(() => { if (!user || typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "default") return; const tm = setTimeout(() => setShow(true), 2000); return () => clearTimeout(tm) }, [user])
  if (!show) return null
  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4 animate-fade-up"><div className="mx-auto max-w-lg rounded-2xl border border-brand-200 bg-white p-4 shadow-xl">
      <div className="flex items-start gap-3"><span className="text-2xl">🔔</span><div className="flex-1"><p className="text-sm font-semibold text-brand-900">{t("notif.title")}</p><p className="mt-0.5 text-xs text-brand-500">{t("notif.subtitle")}</p></div></div>
      <div className="mt-3 flex gap-2"><button onClick={async () => { await requestNotificationPermission(); setShow(false) }} className="flex-1 rounded-xl bg-leaf-600 py-2.5 text-sm font-medium text-white">{t("notif.enable")}</button><button onClick={() => setShow(false)} className="flex-1 rounded-xl border border-brand-200 py-2.5 text-sm font-medium text-brand-500">{t("notif.later")}</button></div>
    </div></div>
  )
}
