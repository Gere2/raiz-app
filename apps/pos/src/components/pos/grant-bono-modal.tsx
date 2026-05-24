"use client"

/**
 * GrantBonoModal — modal POS para activar el "Bono Supervivencia Exámenes" a
 * un cliente cuando paga físicamente en tienda (datáfono o efectivo).
 *
 * Flujo:
 *  1. Al abrir, llama a Brain `/exam-pass/quote` para mostrar precio fresco.
 *  2. Buscador con autocomplete sobre `customer_profiles` (estudiantes y
 *     profesores) — el id es el UID Firebase del cliente.
 *  3. Selector método de pago (efectivo / datáfono).
 *  4. Botón "Activar bono y cobrar X €" → llama a Brain admin/grant.
 *  5. Si Brain devuelve ACTIVE_PASS_EXISTS, mostramos toast claro: "este
 *     cliente ya tiene un bono activo, no doble-cobres".
 */

import { useEffect, useMemo, useState } from "react"
import {
  Banknote,
  CreditCard,
  Gift,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import type { User } from "firebase/auth"
import {
  getAllCustomers,
  invalidateCustomerCache,
  type CustomerOption,
} from "@/lib/customer-selector-service"
import {
  fetchExamPassQuote,
  grantBonoInStore,
  type ExamPassQuote,
  type PaymentMethod,
} from "@/lib/exam-pass-admin-service"
import { toast } from "@/components/ui/use-toast"

interface GrantBonoModalProps {
  user: User
  orgId: string
  onClose: () => void
  onGranted?: (passId: string, customerName: string) => void
}

type LoadStatus = "loading" | "ready" | "error"

export function GrantBonoModal({
  user,
  orgId,
  onClose,
  onGranted,
}: GrantBonoModalProps) {
  // Quote (precio actual)
  const [quote, setQuote] = useState<ExamPassQuote | null>(null)
  const [quoteStatus, setQuoteStatus] = useState<LoadStatus>("loading")
  const [quoteErrorMsg, setQuoteErrorMsg] = useState<string | null>(null)

  // Cliente
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<CustomerOption | null>(null)

  // Cobro
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [note, setNote] = useState("")

  // Submit
  const [submitting, setSubmitting] = useState(false)

  // Trigger para forzar recarga de customers.
  const [customersReloadNonce, setCustomersReloadNonce] = useState(0)
  const [customersLoading, setCustomersLoading] = useState(true)

  // Cargar quote + customers al abrir y cuando se pide refresh.
  useEffect(() => {
    let alive = true
    ;(async () => {
      // Quote (solo en la primera carga; al refrescar customers no rehace quote).
      if (customersReloadNonce === 0) {
        const qRes = await fetchExamPassQuote(user, orgId)
        if (!alive) return
        if (qRes.ok) {
          setQuote(qRes.data)
          setQuoteStatus("ready")
        } else {
          setQuoteStatus("error")
          setQuoteErrorMsg(qRes.error.message ?? qRes.error.error)
        }
      }

      // Customers — todos los registrados, sin filtrar por userType. Con
      // refresh manual el barista ve los nuevos sin esperar al TTL.
      try {
        setCustomersLoading(true)
        const force = customersReloadNonce > 0
        if (force) invalidateCustomerCache()
        const list = await getAllCustomers(force)
        if (!alive) return
        setCustomers(list)
      } catch (err) {
        console.error("[grant-bono-modal] error cargando customers:", err)
      } finally {
        if (alive) setCustomersLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [user, orgId, customersReloadNonce])

  // Filtrado del buscador.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers.slice(0, 8) // muestra primeros 8 al abrir
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.email ?? "").toLowerCase().includes(term),
      )
      .slice(0, 12)
  }, [customers, search])

  const canSubmit =
    !!selected &&
    !!paymentMethod &&
    quoteStatus === "ready" &&
    !submitting

  async function handleSubmit() {
    if (!selected || !paymentMethod) return
    setSubmitting(true)
    const res = await grantBonoInStore(user, orgId, {
      userId: selected.id,
      paymentMethod,
      note: note.trim() || undefined,
    })
    setSubmitting(false)

    if (!res.ok) {
      let msg: string
      if (res.error.error === "ACTIVE_PASS_EXISTS") {
        // Construimos el mensaje con créditos restantes y expiración para
        // que el barista entienda QUÉ bono le bloquea, no solo "ya tiene".
        const d = res.error.details
        const remaining =
          d?.creditsTotal != null && d?.creditsUsed != null
            ? Math.max(
                0,
                d.creditsTotal - d.creditsUsed - (d.creditsReserved ?? 0),
              )
            : null
        const expira = d?.expiresAt
          ? new Date(d.expiresAt).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : null
        const parts = [
          `${selected.name} ya tiene un bono activo.`,
          remaining != null && d?.creditsTotal != null
            ? `Le quedan ${remaining}/${d.creditsTotal} cafés`
            : null,
          expira ? `· válido hasta ${expira}` : null,
          "No vuelvas a cobrar.",
        ].filter(Boolean)
        msg = parts.join(" ")
      } else if (
        res.error.error === "FORBIDDEN" ||
        res.error.error === "UNAUTHORIZED"
      ) {
        msg = "No estás autorizado. Verifica que tu usuario es staff (cafe_users)."
      } else {
        msg = res.error.message ?? `Error: ${res.error.error}`
      }
      toast({
        variant: "destructive",
        title: "No se pudo activar el bono",
        description: msg,
      })
      return
    }

    toast({
      title: "Bono activado",
      description: `${selected.name} — ${res.data.pass.purchasePrice} €. Cliente verá ${res.data.pass.creditsTotal} créditos en su app.`,
    })
    onGranted?.(res.data.pass.id, selected.name)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-bold">Activar bono cliente</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Precio */}
          <section className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            {quoteStatus === "loading" && (
              <div className="flex items-center gap-2 text-sm text-amber-900">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando precio…
              </div>
            )}
            {quoteStatus === "error" && (
              <div className="text-sm text-red-700">
                Error cargando precio: {quoteErrorMsg ?? "desconocido"}
              </div>
            )}
            {quoteStatus === "ready" && quote && (
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-2xl font-bold text-amber-900">
                    {quote.price} €
                  </div>
                  <div className="text-xs text-amber-700">
                    10 créditos · 60 días de validez
                  </div>
                </div>
                {quote.earlyBirdRemaining > 0 ? (
                  <div className="text-right text-xs text-amber-700">
                    Quedan {quote.earlyBirdRemaining}
                    <br />
                    al precio early-bird
                  </div>
                ) : (
                  <div className="text-right text-xs text-amber-700">
                    Precio standard
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Buscador cliente */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold">
                1. Cliente
              </label>
              <button
                type="button"
                onClick={() => setCustomersReloadNonce((n) => n + 1)}
                disabled={customersLoading}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-60"
                title="Refrescar lista (si un cliente acaba de registrarse)"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${customersLoading ? "animate-spin" : ""}`} />
                {customersLoading ? "Cargando…" : "Refrescar"}
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Busca por nombre o email…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSelected(null)
                }}
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                autoFocus
              />
            </div>
            {!selected && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500">
                    {search.trim()
                      ? "Sin resultados"
                      : "Empieza a escribir o elige uno…"}
                  </li>
                ) : (
                  filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelected(c)}
                        className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm hover:bg-amber-50 last:border-b-0"
                      >
                        <div>
                          <div className="font-medium">{c.name}</div>
                          {c.email && (
                            <div className="text-xs text-gray-500">{c.email}</div>
                          )}
                        </div>
                        <span className="text-xs uppercase text-gray-400">
                          {c.userType === "teacher" ? "Profesor" : "Estudiante"}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            {selected && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                <div className="text-sm">
                  <div className="font-semibold text-emerald-900">
                    {selected.name}
                  </div>
                  {selected.email && (
                    <div className="text-xs text-emerald-700">
                      {selected.email}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelected(null)
                    setSearch("")
                  }}
                  className="text-xs text-emerald-700 underline hover:text-emerald-900"
                >
                  Cambiar
                </button>
              </div>
            )}
          </section>

          {/* Método pago */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold">
              2. Método de pago
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod("card_terminal")}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition ${
                  paymentMethod === "card_terminal"
                    ? "border-amber-500 bg-amber-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <CreditCard className="h-6 w-6" />
                <span className="text-sm font-medium">Datáfono</span>
              </button>
              <button
                onClick={() => setPaymentMethod("cash")}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition ${
                  paymentMethod === "cash"
                    ? "border-amber-500 bg-amber-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <Banknote className="h-6 w-6" />
                <span className="text-sm font-medium">Efectivo</span>
              </button>
            </div>
          </section>

          {/* Nota opcional */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold">
              3. Nota (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej. promo octubre"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t bg-gray-50 px-5 py-4">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Activando…
              </span>
            ) : quote ? (
              `Activar bono y cobrar ${quote.price} €`
            ) : (
              "Activar bono"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
