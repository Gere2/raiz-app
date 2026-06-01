"use client"

/**
 * RedeemBonoModal — modal POS para canjear el "Bono Supervivencia Exámenes"
 * de un cliente en barra. El barista:
 *   1. Busca al cliente (mismo patrón que GrantBonoModal).
 *   2. Si el cliente tiene bono active, ve sus créditos restantes.
 *   3. Elige bebida (incluida o premium con suplemento), leche si aplica,
 *      extras y pastry.
 *   4. Ve el TOTAL de suplementos a cobrar.
 *   5. Elige método de pago (efectivo / datáfono).
 *   6. Pulsa "Cobrar X € y servir café" → Brain consume el crédito y
 *      registra el canje con paymentMethod.
 *
 * Validación canónica: el server corre `computeOrder` al confirmar — el total
 * mostrado aquí es solo informativo. Si hay desfase de catálogo, el server
 * rechaza con código claro.
 *
 * Catálogo: embebido como `as const` para evitar otra dependencia. Debe
 * mantenerse sincronizado con apps/brain/lib/exam-pass/config.ts (mirror).
 */

import { useEffect, useMemo, useState } from "react"
import {
  Banknote,
  Coffee,
  CreditCard,
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
  fetchCustomerBonoStatus,
  redeemBonoInStore,
  type CustomerBonoStatus,
  type PaymentMethod,
} from "@/lib/exam-pass-admin-service"
import { toast } from "@/components/ui/use-toast"

// ── Catálogo (mirror de apps/brain/lib/exam-pass/config.ts) ───────

const INCLUDED = [
  { id: "cafe_solo", name: "Café solo", hasMilk: false },
  { id: "americano", name: "Americano", hasMilk: false },
  { id: "cortado", name: "Cortado", hasMilk: true },
  { id: "cafe_con_leche", name: "Café con leche", hasMilk: true },
] as const

const PREMIUM = [
  { id: "matcha_hot", name: "Matcha caliente", supplement: 0.5, hasMilk: true, isIced: false },
  { id: "chai_hot", name: "Chai caliente", supplement: 0.5, hasMilk: true, isIced: false },
  { id: "iced_coffee", name: "Iced coffee", supplement: 1.0, hasMilk: false, isIced: true },
  { id: "iced_matcha", name: "Iced matcha", supplement: 1.5, hasMilk: true, isIced: true },
  { id: "iced_chai", name: "Iced chai", supplement: 1.5, hasMilk: true, isIced: true },
] as const

const MILKS = [
  { id: "whole", name: "Entera", supplement: 0 },
  { id: "lactose_free", name: "Sin lactosa", supplement: 0 },
  { id: "oat", name: "Avena", supplement: 0.2 },
  { id: "almond", name: "Almendra", supplement: 0.2 },
] as const

const EXTRAS = [
  { id: "extra_shot", name: "Extra shot", supplement: 0.5 },
  { id: "large_size", name: "Tamaño grande", supplement: 0.5 },
  { id: "iced_version", name: "Versión iced", supplement: 1.0 },
] as const

const PASTRIES = [
  { id: "cookie", name: "Galleta", price: 1.5, normalPrice: 2.0 },
  { id: "cake", name: "Bizcocho", price: 2.0, normalPrice: 2.5 },
] as const

type ProductId =
  | (typeof INCLUDED)[number]["id"]
  | (typeof PREMIUM)[number]["id"]
type MilkId = (typeof MILKS)[number]["id"]
type ExtraId = (typeof EXTRAS)[number]["id"]
type PastryId = (typeof PASTRIES)[number]["id"]

function findProduct(id: string) {
  return [...INCLUDED, ...PREMIUM].find((p) => p.id === id)
}
function findPremium(id: string) {
  return PREMIUM.find((p) => p.id === id)
}
function findMilk(id: string) {
  return MILKS.find((m) => m.id === id)
}
function findExtra(id: string) {
  return EXTRAS.find((e) => e.id === id)
}
function findPastry(id: string) {
  return PASTRIES.find((p) => p.id === id)
}

function fmtEur(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`
}

// ── Component ─────────────────────────────────────────────────────

interface RedeemBonoModalProps {
  user: User
  orgId: string
  onClose: () => void
  onRedeemed?: (redemptionId: string, customerName: string) => void
}

export function RedeemBonoModal({
  user,
  orgId,
  onClose,
  onRedeemed,
}: RedeemBonoModalProps) {
  // Cliente
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<CustomerOption | null>(null)

  // Estado del bono del cliente seleccionado.
  const [status, setStatus] = useState<CustomerBonoStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  // bump para forzar reintento manual del fetch.
  const [statusReloadNonce, setStatusReloadNonce] = useState(0)

  // Selección de canje.
  const [productId, setProductId] = useState<ProductId | null>(null)
  const [milkId, setMilkId] = useState<MilkId | null>(null)
  const [extras, setExtras] = useState<Set<ExtraId>>(new Set())
  const [pastryId, setPastryId] = useState<PastryId | null>(null)

  // Pago + nota.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [note, setNote] = useState("")

  // Submit
  const [submitting, setSubmitting] = useState(false)

  // Trigger para forzar recarga (botón refresh).
  const [customersReloadNonce, setCustomersReloadNonce] = useState(0)
  const [customersLoading, setCustomersLoading] = useState(true)

  // Cargar customers al abrir y cada vez que se pide refresh.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setCustomersLoading(true)
        const force = customersReloadNonce > 0
        if (force) invalidateCustomerCache()
        const list = await getAllCustomers(force)
        if (!alive) return
        setCustomers(list)
      } catch (err) {
        console.error("[redeem-bono-modal] error cargando customers:", err)
      } finally {
        if (alive) setCustomersLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [customersReloadNonce])

  // Cuando cambia el cliente seleccionado, leer su estado de bono.
  // `statusReloadNonce` permite reintentos manuales sin cambiar el cliente.
  useEffect(() => {
    let alive = true
    if (!selected) {
      setStatus(null)
      setStatusError(null)
      return
    }
    setStatusLoading(true)
    setStatusError(null)
    ;(async () => {
      const res = await fetchCustomerBonoStatus(user, orgId, selected.id)
      if (!alive) return
      setStatusLoading(false)
      if (res.ok) {
        setStatus(res.data)
        setStatusError(null)
      } else {
        setStatus(null)
        // Mensaje granular: 404 suele significar que el endpoint admin/customer-status
        // no está desplegado en Brain todavía.
        const friendly =
          res.error.error === "UPSTREAM_UNREACHABLE"
            ? "Brain inalcanzable. Revisa el deploy."
            : res.error.message?.includes("NOT_FOUND") || res.error.error === "NOT_FOUND"
              ? "Endpoint no encontrado en Brain. ¿Está el deploy actualizado?"
              : (res.error.message ?? res.error.error)
        setStatusError(friendly)
        toast({
          variant: "destructive",
          title: "No se pudo leer el bono del cliente",
          description: friendly,
        })
      }
    })()
    return () => {
      alive = false
    }
  }, [selected, user, orgId, statusReloadNonce])

  // Filtrado del buscador.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers.slice(0, 8)
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.email ?? "").toLowerCase().includes(term),
      )
      .slice(0, 12)
  }, [customers, search])

  // Cambiar de bebida limpia leche / iced_version si dejan de aplicar.
  function selectProduct(id: ProductId) {
    setProductId(id)
    const prod = findProduct(id)
    if (prod && !prod.hasMilk) setMilkId(null)
    if (findPremium(id)?.isIced && extras.has("iced_version")) {
      const next = new Set(extras)
      next.delete("iced_version")
      setExtras(next)
    }
  }

  function toggleExtra(id: ExtraId) {
    const next = new Set(extras)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExtras(next)
  }

  // Total local — el server lo recalcula al confirmar.
  const total = useMemo(() => {
    if (!productId) return 0
    const premium = findPremium(productId)
    let t = premium?.supplement ?? 0
    if (milkId) t += findMilk(milkId)?.supplement ?? 0
    Array.from(extras).forEach((e) => {
      t += findExtra(e)?.supplement ?? 0
    })
    if (pastryId) t += findPastry(pastryId)?.price ?? 0
    return Math.round(t * 100) / 100
  }, [productId, milkId, extras, pastryId])

  // Filtra "iced_version" cuando la bebida ya es iced.
  const visibleExtras = useMemo(() => {
    const isIced = productId ? findPremium(productId)?.isIced ?? false : false
    return EXTRAS.filter((e) => !(e.id === "iced_version" && isIced))
  }, [productId])

  // Validez del submit.
  const product = productId ? findProduct(productId) : null
  const milkRequired = product?.hasMilk === true
  const milkOK = !milkRequired || milkId !== null
  const customerHasUsable =
    status?.state === "active" &&
    !!status.pass &&
    status.creditsAvailable > 0
  // paymentMethod solo es obligatorio cuando hay total > 0. Para canjes 0 €
  // (café solo sin extras) el botón "Servir café" debe poder pulsarse sin
  // selector de pago.
  const needsPayment = total > 0
  const canSubmit =
    !!selected &&
    !!productId &&
    milkOK &&
    (!needsPayment || !!paymentMethod) &&
    customerHasUsable &&
    !submitting

  // Pista textual de qué falta para el botón. El barista no debería tener
  // que adivinar por qué el botón está gris.
  const disabledReason: string | null = (() => {
    if (submitting) return null
    if (!selected) return "Selecciona cliente"
    if (!customerHasUsable) return "Cliente sin bono utilizable"
    if (!productId) return "Selecciona bebida"
    if (!milkOK) return "Selecciona leche"
    if (needsPayment && !paymentMethod) return "Selecciona método de pago"
    return null
  })()

  async function handleSubmit() {
    if (!selected || !productId) return
    // Para canjes 0 € enviamos "cash" como método (es solo trace; no se cobra
    // nada). Para >0 € seguimos exigiendo selección explícita.
    const effectivePaymentMethod: PaymentMethod = paymentMethod ?? "cash"
    if (needsPayment && !paymentMethod) return
    setSubmitting(true)
    const res = await redeemBonoInStore(user, orgId, {
      userId: selected.id,
      input: {
        productId,
        milkId: milkId ?? null,
        extras: Array.from(extras),
        pastryId: pastryId ?? null,
      },
      paymentMethod: effectivePaymentMethod,
      note: note.trim() || undefined,
    })
    setSubmitting(false)

    if (!res.ok) {
      let msg: string
      const code = res.error.error
      if (code === "NO_ACTIVE_PASS") {
        msg = `${selected.name} no tiene un bono activo. Cobra el café normalmente.`
      } else if (code === "PASS_EXPIRED") {
        msg = `El bono de ${selected.name} ha caducado.`
      } else if (code === "NO_CREDITS") {
        msg = `${selected.name} ha usado los 10 cafés del bono.`
      } else if (code === "INVALID_SELECTION" || code === "PRODUCT_NOT_FOUND") {
        msg = "Selección inválida — revisa la bebida y los modificadores."
      } else if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
        msg = "No estás autorizado. Verifica que tu usuario es staff."
      } else {
        msg = res.error.message ?? `Error: ${code}`
      }
      toast({
        variant: "destructive",
        title: "No se pudo canjear",
        description: msg,
      })
      return
    }

    toast({
      title: "Canje registrado",
      description: `${selected.name} — ${res.data.quote.productName}${
        total > 0 ? ` · cobrado ${fmtEur(total)}` : " · sin coste"
      }. Le quedan ${
        res.data.pass.creditsTotal -
        res.data.pass.creditsUsed -
        res.data.pass.creditsReserved
      }/${res.data.pass.creditsTotal} cafés.`,
    })
    onRedeemed?.(res.data.redemption.id, selected.name)
    onClose()
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold">Canjear bono</h2>
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
          {/* 1. Cliente */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold">1. Cliente</label>
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
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                autoFocus
              />
            </div>
            {!selected && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500">
                    {search.trim() ? "Sin resultados" : "Empieza a escribir o elige uno…"}
                  </li>
                ) : (
                  filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelected(c)}
                        className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm hover:bg-emerald-50 last:border-b-0"
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
                  <div className="font-semibold text-emerald-900">{selected.name}</div>
                  {selected.email && (
                    <div className="text-xs text-emerald-700">{selected.email}</div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelected(null)
                    setSearch("")
                    setStatus(null)
                    setStatusError(null)
                  }}
                  className="text-xs text-emerald-700 underline hover:text-emerald-900"
                >
                  Cambiar
                </button>
              </div>
            )}
          </section>

          {/* 2. Estado del bono */}
          {selected && (
            <section
              className={`rounded-xl border p-3 ${
                statusError
                  ? "bg-red-50 border-red-200"
                  : "bg-emerald-50 border-emerald-200"
              }`}
            >
              {statusLoading && (
                <div className="flex items-center gap-2 text-sm text-emerald-900">
                  <Loader2 className="h-4 w-4 animate-spin" /> Leyendo bono…
                </div>
              )}
              {!statusLoading && statusError && (
                <div className="space-y-2 text-sm">
                  <div className="font-semibold text-red-900">
                    Error leyendo el bono del cliente
                  </div>
                  <div className="text-xs text-red-700">{statusError}</div>
                  <button
                    type="button"
                    onClick={() => setStatusReloadNonce((n) => n + 1)}
                    className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {!statusLoading && !statusError && status?.state === "active" && status.pass && (
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-emerald-900">
                    Le quedan {status.creditsAvailable}/{status.pass.creditsTotal} cafés
                  </div>
                  <div className="text-xs text-emerald-700">
                    {status.pass.expiresAt
                      ? `Válido hasta ${new Date(status.pass.expiresAt).toLocaleDateString(
                          "es-ES",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}`
                      : "Sin fecha de expiración"}
                  </div>
                  {status.creditsAvailable <= 0 && (
                    <div className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-900">
                      Sin créditos disponibles.
                    </div>
                  )}
                </div>
              )}
              {!statusLoading && !statusError && status?.state === "pending" && (
                <div className="text-sm text-amber-900">
                  El cliente tiene un pago en proceso. Espera a que confirme antes de canjear.
                </div>
              )}
              {!statusLoading && !statusError && status?.state === "none" && (
                <div className="text-sm text-red-900">
                  Este cliente no tiene un bono activo. Cobra el café normalmente.
                </div>
              )}
            </section>
          )}

          {/* 3. Bebida — solo si el cliente tiene bono usable */}
          {customerHasUsable && (
            <>
              <section className="space-y-2">
                <label className="block text-sm font-semibold">2. Bebida</label>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                      Incluidas (1 crédito)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {INCLUDED.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => selectProduct(p.id)}
                          className={`rounded-lg border-2 p-2 text-left text-sm transition ${
                            productId === p.id
                              ? "border-emerald-500 bg-emerald-50"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                      Premium (1 crédito + suplemento)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {PREMIUM.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => selectProduct(p.id)}
                          className={`rounded-lg border-2 p-2 text-left text-sm transition ${
                            productId === p.id
                              ? "border-emerald-500 bg-emerald-50"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">
                            +{fmtEur(p.supplement)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* 4. Leche — solo si bebida la lleva */}
              {productId && findProduct(productId)?.hasMilk && (
                <section className="space-y-2">
                  <label className="block text-sm font-semibold">3. Leche</label>
                  <div className="grid grid-cols-2 gap-2">
                    {MILKS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMilkId(m.id)}
                        className={`rounded-lg border-2 p-2 text-left text-sm transition ${
                          milkId === m.id
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-gray-500">
                          {m.supplement > 0 ? `+${fmtEur(m.supplement)}` : "Sin coste"}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* 5. Extras */}
              {productId && (
                <section className="space-y-2">
                  <label className="block text-sm font-semibold">
                    {findProduct(productId)?.hasMilk ? "4. Extras" : "3. Extras"}
                    <span className="ml-1 text-xs font-normal text-gray-500">(opcional)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {visibleExtras.map((e) => (
                      <label
                        key={e.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-2 text-sm transition ${
                          extras.has(e.id)
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={extras.has(e.id)}
                          onChange={() => toggleExtra(e.id)}
                        />
                        <div>
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-gray-500">
                            +{fmtEur(e.supplement)}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {/* 6. Dulce */}
              {productId && (
                <section className="space-y-2">
                  <label className="block text-sm font-semibold">
                    {findProduct(productId)?.hasMilk ? "5. Dulce" : "4. Dulce"}
                    <span className="ml-1 text-xs font-normal text-gray-500">(opcional)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PASTRIES.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPastryId(pastryId === p.id ? null : p.id)}
                        className={`rounded-lg border-2 p-2 text-left text-sm transition ${
                          pastryId === p.id
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-500">
                          +{fmtEur(p.price)} <span className="line-through">{fmtEur(p.normalPrice)}</span>
                        </div>
                      </button>
                    ))}
                    <button
                      onClick={() => setPastryId(null)}
                      className={`rounded-lg border-2 p-2 text-sm transition ${
                        pastryId === null
                          ? "border-gray-400 bg-gray-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      No, gracias
                    </button>
                  </div>
                </section>
              )}

              {/* Total + pago */}
              {productId && (
                <section className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold">Hoy cobras</span>
                    <span className="text-2xl font-bold">{fmtEur(total)}</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Se descuenta 1 crédito del bono{total > 0 ? " además del cobro" : ""}.
                  </div>

                  {total > 0 && (
                    <>
                      <div className="border-t border-gray-200" />
                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase text-gray-600">
                          Método de pago
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setPaymentMethod("card_terminal")}
                            className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition ${
                              paymentMethod === "card_terminal"
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <CreditCard className="h-5 w-5" />
                            <span className="text-xs font-medium">Datáfono</span>
                          </button>
                          <button
                            onClick={() => setPaymentMethod("cash")}
                            className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition ${
                              paymentMethod === "cash"
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <Banknote className="h-5 w-5" />
                            <span className="text-xs font-medium">Efectivo</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* Nota opcional */}
              {productId && (
                <section className="space-y-2">
                  <label className="block text-sm font-semibold">Nota (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. para llevar"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </section>
              )}
            </>
          )}
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
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Confirmando…
              </span>
            ) : disabledReason ? (
              disabledReason
            ) : total > 0 ? (
              `Cobrar ${fmtEur(total)} y servir`
            ) : (
              "Servir café"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
