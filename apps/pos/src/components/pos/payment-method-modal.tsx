"use client"

import { useState, useEffect } from "react"
import { Banknote, CreditCard, X, Search, CalendarCheck, CalendarClock, HelpCircle, GraduationCap, BookOpen, ChevronRight, ChevronLeft, Camera, Hash, CheckCircle2 } from "lucide-react"
import type { PaymentMethod, CustomerFrequency, CustomerRole } from "@/lib/ticket-service"
import { getStudents, getTeachers, type CustomerOption } from "@/lib/customer-selector-service"
import { lookupByUID, lookupByNumericCode } from "@/lib/loyalty-lookup-service"
import { calculatePoints } from "@/lib/loyalty-points-service"
import { QRScannerModal } from "./qr-scanner-modal"

interface PaymentMethodModalProps {
  total: number
  onSelect: (
    method: PaymentMethod,
    customerFrequency: CustomerFrequency,
    customerRole: CustomerRole,
    selectedCustomerId?: string,
    selectedCustomerName?: string,
  ) => void
  onClose: () => void
}

export function PaymentMethodModal({ total, onSelect, onClose }: PaymentMethodModalProps) {
  // Step: "classify" → "payment"
  const [step, setStep] = useState<"classify" | "payment">("classify")

  // Frecuencia
  const [frequency, setFrequency] = useState<CustomerFrequency>(null)

  // Rol + cliente seleccionado
  const [role, setRole] = useState<CustomerRole>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")

  // QR / código numérico
  const [showScanner, setShowScanner] = useState(false)
  const [numericCode, setNumericCode] = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  // Payment processing protection
  const [submitting, setSubmitting] = useState(false)

  // Cargar clientes al seleccionar rol
  useEffect(() => {
    if (!role) {
      setCustomers([])
      if (!selectedCustomer) setCustomerSearch("")
      return
    }
    let cancelled = false
    setLoadingCustomers(true)
    const fetcher = role === "alumno" ? getStudents : getTeachers
    fetcher().then(list => {
      if (!cancelled) {
        setCustomers(list)
        setLoadingCustomers(false)
      }
    })
    return () => { cancelled = true }
  }, [role])

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
      )
    : customers

  // Identificar cliente por QR
  const handleQRScan = async (value: string) => {
    setShowScanner(false)
    setLookupLoading(true)
    setLookupError(null)
    try {
      const customer = await lookupByUID(value)
      if (customer) {
        setSelectedCustomer(customer)
        setRole(customer.userType === "teacher" ? "profesor" : "alumno")
      } else {
        setLookupError("Cliente no encontrado")
      }
    } catch {
      setLookupError("Error al buscar cliente")
    } finally {
      setLookupLoading(false)
    }
  }

  // Identificar cliente por código numérico
  const handleCodeLookup = async () => {
    if (numericCode.length !== 4) return
    setLookupLoading(true)
    setLookupError(null)
    try {
      const customer = await lookupByNumericCode(numericCode)
      if (customer) {
        setSelectedCustomer(customer)
        setRole(customer.userType === "teacher" ? "profesor" : "alumno")
        setNumericCode("")
      } else {
        setLookupError("Código no encontrado")
      }
    } catch {
      setLookupError("Error al buscar")
    } finally {
      setLookupLoading(false)
    }
  }

  const handlePayment = async (method: PaymentMethod) => {
    if (submitting) return // Prevent double-click
    setSubmitting(true)
    try {
      onSelect(
        method,
        frequency,
        role,
        selectedCustomer?.id,
        selectedCustomer?.name,
      )
    } catch (error) {
      console.error("Payment error:", error)
      setSubmitting(false)
    }
  }

  const pointsPreview = calculatePoints(total)

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
            <h2 className="text-lg font-bold text-gray-900">
              {step === "classify" ? "Clasificar cliente" : "Método de pago"}
            </h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {step === "classify" ? (
            <>
              {/* ═══ PASO 1: Clasificación ═══ */}
              <div className="p-4 space-y-4">
                {/* Total */}
                <div className="text-center pb-2">
                  <p className="text-sm text-gray-500">Total a cobrar</p>
                  <p className="text-2xl font-bold text-gray-900">{total.toFixed(2)} €</p>
                </div>

                {/* ── Identificación rápida (QR + código) ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Identificar cliente</p>

                  {/* Cliente identificado */}
                  {selectedCustomer && (
                    <div className="flex items-center gap-3 rounded-xl border-2 border-green-400 bg-green-50 p-3 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-green-800 truncate">{selectedCustomer.name}</p>
                        <p className="text-[10px] text-green-600">
                          {selectedCustomer.userType === "teacher" ? "Profesor" : "Alumno"}
                          {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => { setSelectedCustomer(null); setRole(null) }}
                        className="text-green-400 hover:text-green-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {!selectedCustomer && (
                    <div className="space-y-2">
                      {/* Botones QR + Código */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setShowScanner(true)}
                          className="flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white p-3 text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all active:scale-[0.97]"
                        >
                          <Camera className="h-5 w-5" />
                          <span className="text-sm font-bold">Escanear QR</span>
                        </button>

                        <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden">
                          <div className="flex items-center pl-3">
                            <Hash className="h-4 w-4 text-gray-400" />
                          </div>
                          <input
                            type="text"
                            maxLength={4}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={numericCode}
                            onChange={(e) => {
                              setNumericCode(e.target.value.replace(/\D/g, ""))
                              setLookupError(null)
                            }}
                            onKeyDown={(e) => e.key === "Enter" && handleCodeLookup()}
                            placeholder="Código"
                            className="w-full px-2 py-3 text-sm font-mono font-bold text-center focus:outline-none"
                          />
                          {numericCode.length === 4 && (
                            <button
                              onClick={handleCodeLookup}
                              disabled={lookupLoading}
                              className="px-3 bg-gray-900 text-white text-xs font-bold hover:bg-gray-800"
                            >
                              {lookupLoading ? "..." : "OK"}
                            </button>
                          )}
                        </div>
                      </div>

                      {lookupError && (
                        <p className="text-xs text-red-500 text-center">{lookupError}</p>
                      )}
                      {lookupLoading && !lookupError && (
                        <p className="text-xs text-gray-400 text-center">Buscando...</p>
                      )}
                    </div>
                  )}

                  {/* Puntos preview */}
                  {selectedCustomer && pointsPreview > 0 && (
                    <p className="text-xs text-green-600 text-center mt-1">
                      +{pointsPreview} puntos para {selectedCustomer.name}
                    </p>
                  )}
                </div>

                {/* ── Frecuencia ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Frecuencia del cliente</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setFrequency(frequency === "habitual" ? null : "habitual")}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all active:scale-[0.97] ${
                        frequency === "habitual"
                          ? "border-green-400 bg-green-50 text-green-800"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <CalendarCheck className="h-5 w-5" />
                      <span className="text-xs font-bold">Habitual</span>
                      <span className="text-[10px] text-gray-400">Todos los días</span>
                    </button>

                    <button
                      onClick={() => setFrequency(frequency === "recurrente" ? null : "recurrente")}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all active:scale-[0.97] ${
                        frequency === "recurrente"
                          ? "border-blue-400 bg-blue-50 text-blue-800"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <CalendarClock className="h-5 w-5" />
                      <span className="text-xs font-bold">Recurrente</span>
                      <span className="text-[10px] text-gray-400">+3 días</span>
                    </button>

                    <button
                      onClick={() => setFrequency(frequency === "extraño" ? null : "extraño")}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all active:scale-[0.97] ${
                        frequency === "extraño"
                          ? "border-orange-400 bg-orange-50 text-orange-800"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <HelpCircle className="h-5 w-5" />
                      <span className="text-xs font-bold">Extraño</span>
                      <span className="text-[10px] text-gray-400">Poco frecuente</span>
                    </button>
                  </div>
                </div>

                {/* ── Tipo de cliente (búsqueda manual) ── */}
                {!selectedCustomer && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">O buscar manualmente</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setRole(role === "alumno" ? null : "alumno")
                          setSelectedCustomer(null)
                          setCustomerSearch("")
                        }}
                        className={`flex items-center gap-2 rounded-xl border-2 p-3 transition-all active:scale-[0.97] ${
                          role === "alumno"
                            ? "border-purple-400 bg-purple-50 text-purple-800"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <GraduationCap className="h-5 w-5" />
                        <span className="text-sm font-bold">Alumno</span>
                      </button>

                      <button
                        onClick={() => {
                          setRole(role === "profesor" ? null : "profesor")
                          setSelectedCustomer(null)
                          setCustomerSearch("")
                        }}
                        className={`flex items-center gap-2 rounded-xl border-2 p-3 transition-all active:scale-[0.97] ${
                          role === "profesor"
                            ? "border-amber-400 bg-amber-50 text-amber-800"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <BookOpen className="h-5 w-5" />
                        <span className="text-sm font-bold">Profesor</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Lista de clientes (si se seleccionó rol manual) ── */}
                {role && !selectedCustomer && (
                  <div className="border rounded-xl overflow-hidden">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={`Buscar ${role === "alumno" ? "alumno" : "profesor"}...`}
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border-b focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="max-h-[140px] overflow-y-auto">
                      {loadingCustomers ? (
                        <div className="p-3 text-center text-sm text-gray-400">Cargando...</div>
                      ) : filteredCustomers.length === 0 ? (
                        <div className="p-3 text-center text-sm text-gray-400">
                          {customerSearch ? "Sin resultados" : `No hay ${role === "alumno" ? "alumnos" : "profesores"} registrados`}
                        </div>
                      ) : (
                        filteredCustomers.slice(0, 50).map(c => (
                          <button
                            key={c.id}
                            onClick={() => setSelectedCustomer(c)}
                            className="w-full text-left px-3 py-2 text-sm border-b last:border-0 transition-colors hover:bg-gray-50"
                          >
                            <div className="font-medium">{c.name}</div>
                            {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Botón siguiente */}
              <div className="p-4 border-t sticky bottom-0 bg-white">
                <button
                  onClick={() => setStep("payment")}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-white py-3 font-bold hover:bg-gray-800 transition-colors active:scale-[0.98]"
                >
                  Continuar al pago
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setFrequency(null)
                    setRole(null)
                    setSelectedCustomer(null)
                    setStep("payment")
                  }}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-2 mt-1"
                >
                  Saltar clasificación →
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ═══ PASO 2: Método de pago ═══ */}
              {/* Total */}
              <div className="px-4 pt-4 pb-2 text-center">
                <p className="text-sm text-gray-500">Total a cobrar</p>
                <p className="text-3xl font-bold text-gray-900">{total.toFixed(2)} €</p>
                {/* Resumen de clasificación */}
                <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                  {frequency && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      {frequency === "habitual" ? "📅 Habitual" : frequency === "recurrente" ? "🔄 Recurrente" : "❓ Extraño"}
                    </span>
                  )}
                  {selectedCustomer && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      {role === "profesor" ? "👨‍🏫" : "🎓"} {selectedCustomer.name} · +{pointsPreview} pts
                    </span>
                  )}
                  {role && !selectedCustomer && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      {role === "alumno" ? "🎓 Alumno" : "👨‍🏫 Profesor"} (sin identificar)
                    </span>
                  )}
                </div>
              </div>

              {/* Payment buttons */}
              <div className="p-4 space-y-3">
                <button
                  onClick={() => handlePayment("CASH")}
                  disabled={submitting}
                  className={`w-full flex items-center gap-4 rounded-xl border-2 border-green-200 bg-green-50 p-4 transition-all active:scale-[0.98] ${
                    submitting
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:border-green-400 hover:bg-green-100"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-200">
                    {submitting ? (
                      <div className="w-6 h-6 rounded-full border-2 border-green-400 border-t-green-700 animate-spin" />
                    ) : (
                      <Banknote className="h-6 w-6 text-green-700" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold text-green-800">
                      {submitting ? "Procesando..." : "Efectivo"}
                    </p>
                    <p className="text-xs text-green-600">Pago en caja</p>
                  </div>
                </button>

                <button
                  onClick={() => handlePayment("CARD")}
                  disabled={submitting}
                  className={`w-full flex items-center gap-4 rounded-xl border-2 border-blue-200 bg-blue-50 p-4 transition-all active:scale-[0.98] ${
                    submitting
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:border-blue-400 hover:bg-blue-100"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-200">
                    {submitting ? (
                      <div className="w-6 h-6 rounded-full border-2 border-blue-400 border-t-blue-700 animate-spin" />
                    ) : (
                      <CreditCard className="h-6 w-6 text-blue-700" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold text-blue-800">
                      {submitting ? "Procesando..." : "Tarjeta"}
                    </p>
                    <p className="text-xs text-blue-600">Datáfono / contactless</p>
                  </div>
                </button>
              </div>

              {/* Botón volver */}
              <div className="px-4 pb-4">
                <button
                  onClick={() => setStep("classify")}
                  className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Volver a clasificación
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* QR Scanner Modal */}
      {showScanner && (
        <QRScannerModal
          onScan={handleQRScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  )
}
