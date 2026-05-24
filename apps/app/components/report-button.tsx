"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { MessageCircleWarning, X, Send, Bug, Lightbulb, HelpCircle } from "lucide-react"
import { toast } from "sonner"

const REPORT_TYPES = [
  { value: "bug", label: "Error / Bug", labelEn: "Bug / Error", icon: Bug, color: "text-red-600 bg-red-50 border-red-200" },
  { value: "improvement", label: "Mejora", labelEn: "Improvement", icon: Lightbulb, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "other", label: "Otro", labelEn: "Other", icon: HelpCircle, color: "text-blue-600 bg-blue-50 border-blue-200" },
]

// Hide on these pages
const HIDDEN_PAGES = ["/login", "/checkout", "/checkout/success", "/offline"]

export function ReportButton() {
  const { user } = useAuth()
  const { locale } = useLanguage()
  const pathname = usePathname()
  const isEn = locale === "en"

  const [open, setOpen] = useState(false)
  const [type, setType] = useState("bug")
  const [description, setDescription] = useState("")
  const [sending, setSending] = useState(false)

  // Don't show if not logged in or on hidden pages
  if (!user || HIDDEN_PAGES.includes(pathname)) return null

  const submit = async () => {
    if (!description.trim()) {
      toast.error(isEn ? "Please describe the issue" : "Describe el problema")
      return
    }
    if (!db) {
      toast.error(isEn ? "Database not available" : "Base de datos no disponible")
      return
    }

    setSending(true)
    try {
      await addDoc(collection(db, "reports"), {
        type,
        description: description.trim(),
        page: pathname,
        source: "APP",
        userId: user.uid,
        userEmail: user.email || "",
        userName: user.displayName || user.email || "",
        status: "new",
        createdAt: serverTimestamp(),
      })

      toast.success(isEn ? "Report sent. Thank you!" : "Reporte enviado. ¡Gracias!")
      setDescription("")
      setType("bug")
      setOpen(false)
    } catch {
      toast.error(isEn ? "Error sending report" : "Error al enviar el reporte")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-brand-900 text-white shadow-lg shadow-brand-900/30 hover:bg-brand-800 active:scale-95 transition-all"
          aria-label={isEn ? "Report a problem" : "Reportar un problema"}
        >
          <MessageCircleWarning className="h-5 w-5" />
        </button>
      )}

      {/* Report modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-brand-200 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center px-5 pt-5 pb-3">
              <h2 className="text-lg font-bold text-brand-900">
                {isEn ? "Report a problem" : "Reportar un problema"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-brand-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-brand-400" />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-4">
              {/* Type selector */}
              <div className="flex gap-2">
                {REPORT_TYPES.map(({ value, label, labelEn, icon: Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => setType(value)}
                    className={`flex-1 flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 text-xs font-medium transition-all ${
                      type === value
                        ? color
                        : "border-brand-200 bg-white text-brand-400 hover:border-brand-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {isEn ? labelEn : label}
                  </button>
                ))}
              </div>

              {/* Description */}
              <div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder={
                    isEn
                      ? "Describe the issue or suggestion..."
                      : "Describe el problema o sugerencia..."
                  }
                  rows={4}
                  maxLength={500}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400 resize-none"
                  autoFocus
                />
                <p className="text-[11px] text-brand-400 mt-1 text-right">
                  {description.length}/500
                </p>
              </div>

              {/* Page context */}
              <p className="text-[11px] text-brand-300">
                {isEn ? "Page" : "Página"}: {pathname}
              </p>

              {/* Submit */}
              <button
                onClick={submit}
                disabled={sending || !description.trim()}
                className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all ${
                  sending || !description.trim()
                    ? "bg-brand-300 cursor-not-allowed"
                    : "bg-leaf-600 hover:bg-leaf-700 active:scale-[0.98] shadow-lg shadow-leaf-600/20"
                }`}
              >
                {sending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {isEn ? "Sending..." : "Enviando..."}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {isEn ? "Send report" : "Enviar reporte"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
