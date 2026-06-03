"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Search, Zap, Smartphone, X, Undo2,
  DollarSign, CreditCard, Trash2, ChevronDown, Plus, Minus, Gift, Coffee,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getCategories, getProductsByCategory, getProducts, type Product } from "@/lib/product-service"
import {
  type OrderItem, type PaymentMethod, type CustomerFrequency,
  type CustomerRole, addTicket, type OrderItemModifier,
} from "@/lib/ticket-service"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"
import { Toaster } from "@/components/ui/toaster"
import { QUICK_COMBOS, type QuickCombo } from "@/lib/pos-combos"
import { MODIFIERS } from "@/lib/pos-modifiers"
import { posMetricsTracker } from "@/lib/pos-metrics"
import { toast } from "@/components/ui/use-toast"
import { useSimpleAuth } from "@/contexts/simple-auth-context"

/* ── Heavy POS components (lazy-loaded for code splitting) ── */
const OrderNotifications = dynamic(() => import("@/components/pos/order-notifications").then(m => ({ default: m.OrderNotifications })), { ssr: false })
const AppOrdersPanel = dynamic(() => import("@/components/pos/app-orders-panel"), { ssr: false })
const PaymentMethodModal = dynamic(() => import("@/components/pos/payment-method-modal").then(m => ({ default: m.PaymentMethodModal })), { ssr: false })
const RedemptionValidator = dynamic(() => import("@/components/pos/redemption-validator").then(m => ({ default: m.RedemptionValidator })), { ssr: false })
const GrantBonoModal = dynamic(() => import("@/components/pos/grant-bono-modal").then(m => ({ default: m.GrantBonoModal })), { ssr: false })
const RedeemBonoModal = dynamic(() => import("@/components/pos/redeem-bono-modal").then(m => ({ default: m.RedeemBonoModal })), { ssr: false })
const AppOrdersWatcher = dynamic(() => import("@/components/pos/app-orders-watcher").then(m => ({ default: m.AppOrdersWatcher })), { ssr: false })

// Storage keys
const PEAK_MODE_KEY = "raiz_peak_mode"
const FAVORITES_KEY = "raiz_favorites"

interface UndoAction {
  type: "add" | "remove" | "combo" | "clear" | "modifier"
  items: OrderItem[]
  timestamp: number
}

export default function POSPageFullscreen() {
  const { user } = useAuth()
  const { orgId } = useOrg(user)
  // Solo Raíz tiene pedidos online (APP/TEACHER_APP) en las colecciones top-level
  // `orders`/`teacher_orders`. Para otros cafés (enverde) esos listeners darían
  // permission-denied (ruido en consola) y la UI no aplica → la ocultamos.
  const isRaiz = orgId === "raiz_y_grano"
  const { user: authUser, isLoading: authLoading } = useSimpleAuth()
  const router = useRouter()

  // Auth guard (inline, no sidebar wrapper)
  useEffect(() => {
    if (!authLoading && !authUser) router.replace("/login")
  }, [authUser, authLoading, router])

  // Core state
  const [order, setOrder] = useState<OrderItem[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [peakMode, setPeakMode] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showAppOrders, setShowAppOrders] = useState(false)
  const [showGrantBonoModal, setShowGrantBonoModal] = useState(false)
  const [showRedeemBonoModal, setShowRedeemBonoModal] = useState(false)
  // Conteo de pedidos APP/TEACHER_APP activos para badge en el botón
  // Smartphone. Lo mantiene actualizado <AppOrdersWatcher /> en background.
  const [activeAppOrdersCount, setActiveAppOrdersCount] = useState(0)
  const [processingOrder, setProcessingOrder] = useState(false)

  // UI state
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isSearching, setIsSearching] = useState(false)

  // Undo stack
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const undoTimerRef = useRef<NodeJS.Timeout>()

  // Expanded item for modifiers
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  // Flash feedback
  const [flashId, setFlashId] = useState<string | null>(null)

  // Peak mode + favorites are local (localStorage) — safe to load on mount.
  useEffect(() => {
    loadPeakMode()
    loadFavorites()
  }, [])

  // Data load waits for orgId: useOrg resolves it asynchronously and
  // product-service now requires a non-empty orgId (multi-tenant). Re-runs
  // if the active café changes.
  useEffect(() => {
    if (!orgId) return
    loadData()
  }, [orgId])

  const loadData = async () => {
    try {
      setLoading(true)
      // Camino crítico: solo categorías + productos de la primera categoría.
      // El barista ya puede empezar a vender en cuanto esto termine.
      const cats = await getCategories(orgId)
      setCategories(cats)
      if (cats.length > 0) {
        setActiveCategory(cats[0].id)
        const catProds = await getProductsByCategory(orgId, cats[0].id)
        setCategoryProducts(catProds)
      }
      setLoading(false)

      // `allProducts` solo se usa en búsqueda, favoritos y resolución de
      // combos — todos secundarios al primer render. Lo traemos en
      // background; el barista no se queda esperando.
      void getProducts(orgId)
        .then((prods) => setAllProducts(prods))
        .catch((err) => {
          // Si falla, búsqueda y favoritos quedan vacíos hasta el siguiente
          // intento. La venta básica sigue funcionando con categorías.
          console.warn("[POS] background load allProducts:", err)
        })
    } catch (error) {
      console.error("Error loading data:", error)
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos" })
      setLoading(false)
    }
  }

  const loadPeakMode = () => {
    try {
      const stored = localStorage.getItem(PEAK_MODE_KEY)
      if (stored === "true") setPeakMode(true)
    } catch {}
  }

  const loadFavorites = () => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY)
      if (stored) setFavorites(JSON.parse(stored))
    } catch {}
  }

  const togglePeakMode = useCallback(() => {
    const newState = !peakMode
    setPeakMode(newState)
    try { localStorage.setItem(PEAK_MODE_KEY, newState.toString()) } catch {}
  }, [peakMode])

  // Category navigation
  const handleCategoryChange = useCallback(async (catId: string) => {
    setActiveCategory(catId)
    setSearchTerm("")
    setIsSearching(false)
    const prods = await getProductsByCategory(orgId, catId)
    setCategoryProducts(prods)
  }, [orgId])

  // Fast add — instant, no modal
  const fastAddProduct = useCallback((product: Product) => {
    posMetricsTracker.recordTap()
    setOrder((prev) => {
      if (prev.length === 0) posMetricsTracker.startTicket(`pos-${Date.now()}`)
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
    setFlashId(product.id)
    setTimeout(() => setFlashId(null), 200)
  }, [])

  // Add combo
  const addCombo = useCallback((combo: QuickCombo) => {
    posMetricsTracker.recordCombo()
    posMetricsTracker.recordTap()
    const newItems: OrderItem[] = []
    for (const comboItem of combo.items) {
      const product = allProducts.find(
        (p) => p.name.toLowerCase().includes(comboItem.productName.toLowerCase())
      )
      if (product) newItems.push({ product, quantity: comboItem.qty })
    }
    if (newItems.length === 0) {
      toast({ variant: "destructive", title: "Combo no disponible", description: "Productos no encontrados" })
      return
    }
    setOrder((prev) => {
      const updated = [...prev]
      for (const newItem of newItems) {
        const existing = updated.find((item) => item.product.id === newItem.product.id)
        if (existing) existing.quantity += newItem.quantity
        else updated.push(newItem)
      }
      return updated
    })
    recordUndo("combo", order)
  }, [allProducts, order])

  // Remove item (decrement)
  const removeItem = useCallback((productId: string) => {
    posMetricsTracker.recordTap()
    setOrder((prev) => {
      const existing = prev.find((item) => item.product.id === productId)
      if (existing && existing.quantity > 1) {
        return prev.map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
      }
      return prev.filter((item) => item.product.id !== productId)
    })
  }, [])

  // Delete item completely
  const deleteItem = useCallback((productId: string) => {
    posMetricsTracker.recordTap()
    recordUndo("remove", order)
    setOrder((prev) => prev.filter((item) => item.product.id !== productId))
    setExpandedItemId(null)
  }, [order])

  // Modifier management
  const addModifier = useCallback((productId: string, modifier: OrderItemModifier) => {
    posMetricsTracker.recordTap()
    setOrder((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          const modifiers = item.modifiers || []
          const exists = modifiers.find((m) => m.id === modifier.id)
          return {
            ...item,
            modifiers: exists ? modifiers.filter((m) => m.id !== modifier.id) : [...modifiers, modifier],
          }
        }
        return item
      })
    )
  }, [])

  // Undo management
  const recordUndo = useCallback((type: UndoAction["type"], items: OrderItem[]) => {
    setUndoStack((prev) => [...prev.slice(-9), { type, items, timestamp: Date.now() }])
    clearTimeout(undoTimerRef.current)
    undoTimerRef.current = setTimeout(() => setUndoStack([]), 60000) // 60 seconds
  }, [])

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const action = prev[prev.length - 1]
      setOrder(action.items)
      posMetricsTracker.recordUndo()
      return prev.slice(0, -1)
    })
  }, [])

  const clearOrder = useCallback(() => {
    recordUndo("clear", order)
    setOrder([])
    setExpandedItemId(null)
  }, [order, recordUndo])

  // Total with modifiers
  const calculateTotal = useCallback((): number => {
    return order.reduce((total, item) => {
      const base = item.product.price * item.quantity
      const mods = (item.modifiers || []).reduce((s, m) => s + m.priceAdjustment, 0) * item.quantity
      return total + base + mods
    }, 0)
  }, [order])

  // Products to display
  const getDisplayProducts = useCallback((): Product[] => {
    if (isSearching && searchTerm.trim() !== "") {
      return allProducts.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    }
    if (peakMode) {
      const favoriteProds = allProducts.filter((p) => favorites.includes(p.id))
      const combined = [...favoriteProds, ...categoryProducts]
      const seen = new Set<string>()
      return combined.filter((p) => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      }).slice(0, 12)
    }
    return categoryProducts
  }, [isSearching, searchTerm, peakMode, allProducts, favorites, categoryProducts])

  // Generate receipt
  const generateReceipt = async (
    selectedPayment: PaymentMethod = "CASH",
    customerFrequency?: CustomerFrequency,
    customerRole?: CustomerRole,
    selectedCustomerId?: string,
    selectedCustomerName?: string
  ) => {
    if (order.length === 0) return
    if (!orgId) {
      toast({ title: "Error", description: "Cargando organización...", variant: "destructive" })
      return
    }
    try {
      setProcessingOrder(true)
      const ticket = await addTicket(
        orgId, order, user?.uid, user?.displayName || user?.email || undefined,
        selectedPayment, customerFrequency, customerRole, selectedCustomerId, selectedCustomerName
      )
      posMetricsTracker.completeTicket(order.length, calculateTotal(), selectedPayment)
      setOrder([])
      setUndoStack([])
      setExpandedItemId(null)
      toast({ title: "Ticket generado", description: `#${ticket.ticketNumber}`, duration: 2000 })
    } catch (error: any) {
      console.error("Error generating receipt:", error)
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar el ticket" })
    } finally {
      setProcessingOrder(false)
    }
  }

  const displayProducts = getDisplayProducts()
  const total = calculateTotal()
  const itemCount = order.reduce((sum, item) => sum + item.quantity, 0)

  // ─── Auth loading / redirect ───
  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#1a2e1a]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto">
            <span className="text-3xl">☕</span>
          </div>
          <div className="w-8 h-8 mx-auto animate-spin rounded-full border-3 border-white/30 border-t-white" />
        </div>
      </div>
    )
  }

  if (!authUser) return null

  // ─── Data loading ───
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[hsl(35,25%,93%)]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(142,40%,18%)] flex items-center justify-center mx-auto shadow-lg">
            <Zap className="h-8 w-8 text-white animate-pulse" />
          </div>
          <p className="text-base font-semibold tracking-wide text-[hsl(0,0%,40%)]">Cargando barra...</p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // MAIN FULLSCREEN RENDER — No sidebar, no container constraints
  // ════════════════════════════════════════════════════════════════
  return (
    <>
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-[hsl(35,22%,91%)]">

        {/* ── HEADER BAR ── Dark branded strip, 56px */}
        <header className="flex items-center justify-between px-5 h-14 bg-[hsl(142,40%,16%)] text-white shrink-0 shadow-md z-10">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center">
              <span className="text-lg">☕</span>
            </div>
            <div>
              <span className="font-bold text-base tracking-wide">Raíz y Grano</span>
              <span className="text-[10px] block text-white/50 font-medium -mt-0.5 tracking-widest uppercase">Punto de Venta</span>
            </div>
            {peakMode && (
              <span className="ml-2 px-3 py-1 rounded-full bg-amber-500 text-xs font-bold uppercase tracking-wider animate-pulse shadow-lg shadow-amber-500/30">
                Pico
              </span>
            )}
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-1.5">
            <button
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isSearching ? "bg-white/25" : "hover:bg-white/10"}`}
              onClick={() => setIsSearching(!isSearching)}
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${peakMode ? "bg-amber-500 shadow-lg shadow-amber-500/30" : "hover:bg-white/10"}`}
              onClick={togglePeakMode}
            >
              <Zap className="h-5 w-5" />
            </button>
            {isRaiz && (
            <button
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${showAppOrders ? "bg-white/25" : "hover:bg-white/10"}`}
              onClick={() => setShowAppOrders(!showAppOrders)}
              title={
                activeAppOrdersCount > 0
                  ? `${activeAppOrdersCount} pedido${activeAppOrdersCount === 1 ? "" : "s"} de la app`
                  : "Pedidos de la app"
              }
              aria-label={
                activeAppOrdersCount > 0
                  ? `${activeAppOrdersCount} pedidos de la app`
                  : "Pedidos de la app"
              }
            >
              <Smartphone className="h-5 w-5" />
              {activeAppOrdersCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow ring-2 ring-black/30"
                  aria-hidden="true"
                >
                  {activeAppOrdersCount > 99 ? "99+" : activeAppOrdersCount}
                </span>
              )}
            </button>
            )}
            {/* Bonos de cliente (exam-pass de Raíz) — per-café en task #3 */}
            {isRaiz && (<>
            <button
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
              onClick={() => setShowGrantBonoModal(true)}
              title="Activar bono cliente"
              aria-label="Activar bono cliente"
            >
              <Gift className="h-5 w-5" />
            </button>
            <button
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
              onClick={() => setShowRedeemBonoModal(true)}
              title="Canjear bono cliente"
              aria-label="Canjear bono cliente"
            >
              <Coffee className="h-5 w-5" />
            </button>
            </>)}
            <div className="w-px h-6 bg-white/15 mx-1" />
            <Link href="/">
              <button className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
            </Link>
          </div>
        </header>

        {/* ── SEARCH BAR ── */}
        {isSearching && (
          <div className="px-5 py-3 bg-white border-b border-[hsl(35,20%,85%)] shrink-0 shadow-sm">
            <div className="relative max-w-2xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[hsl(0,0%,55%)]" />
              <input
                placeholder="Buscar producto..."
                className="w-full pl-12 pr-4 h-12 text-lg bg-[hsl(35,25%,96%)] border-2 border-[hsl(35,20%,88%)] rounded-2xl outline-none focus:border-[hsl(142,50%,45%)] transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        )}

        {/* ── CATEGORY TABS ── Large pill-style buttons */}
        {!isSearching && (
          <div className="bg-white border-b border-[hsl(35,20%,86%)] shrink-0 shadow-sm">
            <ScrollArea className="w-full">
              <div className="flex gap-2.5 px-5 py-3">
                {peakMode ? (
                  <button className="shrink-0 px-6 py-2.5 rounded-full text-sm font-bold bg-amber-100 text-amber-800 border-2 border-amber-300">
                    ★ Favoritos
                  </button>
                ) : (
                  categories.map((cat) => (
                    <button
                      key={cat.id}
                      className={`shrink-0 px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
                        activeCategory === cat.id
                          ? "bg-[hsl(142,40%,18%)] text-white shadow-md"
                          : "bg-[hsl(35,18%,92%)] text-[hsl(0,0%,35%)] hover:bg-[hsl(35,18%,86%)]"
                      }`}
                      onClick={() => handleCategoryChange(cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            MAIN AREA — Product Grid (left) + Ticket Panel (right)
            ════════════════════════════════════════════════════════ */}
        <div className="flex-1 overflow-hidden flex">

          {/* ── PRODUCT GRID ── Takes most of the screen */}
          <div className="flex-1 overflow-auto p-4">

            {/* Combos strip (peak mode, empty ticket) */}
            {peakMode && order.length === 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold uppercase tracking-widest text-[hsl(0,0%,50%)] mb-3 px-1">
                  Combos rápidos
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {QUICK_COMBOS.slice(0, 4).map((combo) => (
                    <button
                      key={combo.id}
                      className="flex flex-col items-center justify-center gap-2 py-5 px-3 rounded-2xl bg-white border-2 border-amber-200 hover:border-amber-400 hover:shadow-lg transition-all active:scale-95 shadow-sm"
                      onClick={() => addCombo(combo)}
                    >
                      <span className="text-4xl leading-none">{combo.emoji}</span>
                      <span className="text-sm font-bold text-[hsl(0,0%,20%)] text-center leading-tight">{combo.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Product grid — BIG BUTTONS, 3 columns on large, 2 on smaller */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayProducts.length === 0 ? (
                <div className="col-span-full text-center py-24 text-[hsl(0,0%,50%)]">
                  <div className="text-5xl mb-4 opacity-30">☕</div>
                  <p className="text-lg font-medium">{searchTerm ? "Sin resultados" : "Sin productos"}</p>
                </div>
              ) : (
                displayProducts.map((product) => {
                  const inOrder = order.find((item) => item.product.id === product.id)
                  const isFlashing = flashId === product.id

                  return (
                    <button
                      key={product.id}
                      data-product-id={product.id}
                      className={`relative flex flex-col items-start justify-between p-5 rounded-2xl border-2 transition-all active:scale-[0.96] min-h-[120px] text-left shadow-sm ${
                        isFlashing
                          ? "border-[hsl(142,60%,35%)] bg-[hsl(142,40%,92%)] scale-[0.96] shadow-lg shadow-green-200/50"
                          : inOrder
                            ? "border-[hsl(142,60%,40%)] bg-white shadow-md"
                            : "border-transparent bg-white hover:border-[hsl(35,18%,78%)] hover:shadow-md"
                      }`}
                      onClick={() => fastAddProduct(product)}
                    >
                      {/* Product name — BIG & DOMINANT */}
                      <span className="text-lg font-bold leading-snug text-[hsl(0,0%,10%)] line-clamp-2">
                        {product.name}
                      </span>

                      {/* Price — secondary, green */}
                      <span className="text-base font-bold text-[hsl(142,50%,32%)] mt-2">
                        {product.price.toFixed(2)}€
                      </span>

                      {/* Quantity badge — big, visible */}
                      {inOrder && (
                        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[hsl(142,60%,30%)] text-white text-sm font-black flex items-center justify-center shadow-lg ring-2 ring-white">
                          {inOrder.quantity}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ── TICKET PANEL ── Right side, fixed width */}
          <div className="w-80 xl:w-96 bg-white border-l border-[hsl(35,18%,83%)] flex flex-col shrink-0 shadow-[-4px_0_12px_rgba(0,0,0,0.05)]">

            {/* Ticket header */}
            <div className="px-5 py-3.5 border-b border-[hsl(35,18%,90%)] bg-[hsl(35,20%,97%)]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-[0.2em] text-[hsl(0,0%,45%)]">
                  Ticket
                </span>
                {itemCount > 0 && (
                  <span className="min-w-7 h-7 px-2 rounded-full bg-[hsl(142,50%,30%)] text-white text-xs font-bold flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </div>
            </div>

            {/* Ticket items */}
            <div className="flex-1 overflow-y-auto">
              {order.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[hsl(0,0%,60%)] gap-3 px-8">
                  <div className="w-20 h-20 rounded-full bg-[hsl(35,18%,92%)] flex items-center justify-center">
                    <span className="text-3xl opacity-30">🧾</span>
                  </div>
                  <span className="text-sm text-center leading-relaxed">Toca un producto para empezar</span>
                </div>
              ) : (
                <div className="divide-y divide-[hsl(35,18%,91%)]">
                  {order.map((item) => {
                    const modTotal = (item.modifiers || []).reduce((s, m) => s + m.priceAdjustment, 0)
                    const itemTotal = (item.product.price + modTotal) * item.quantity
                    const isExpanded = expandedItemId === item.product.id

                    return (
                      <div key={item.product.id}>
                        {/* Item row */}
                        <button
                          className="w-full px-5 py-4 text-left hover:bg-[hsl(35,22%,96%)] transition-colors flex items-start gap-3"
                          onClick={() => setExpandedItemId(isExpanded ? null : item.product.id)}
                        >
                          {/* Quantity circle */}
                          <div className="w-9 h-9 rounded-full bg-[hsl(35,18%,90%)] flex items-center justify-center shrink-0">
                            <span className="text-sm font-black text-[hsl(0,0%,25%)]">{item.quantity}</span>
                          </div>

                          {/* Name + mods */}
                          <div className="flex-1 min-w-0">
                            <div className="text-base font-bold text-[hsl(0,0%,10%)] leading-snug">
                              {item.product.name}
                            </div>
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="text-xs text-[hsl(0,0%,50%)] mt-0.5">
                                {item.modifiers.map(m => m.name).join(", ")}
                              </div>
                            )}
                          </div>

                          {/* Price + chevron */}
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <span className="text-base font-black text-[hsl(0,0%,15%)]">{itemTotal.toFixed(2)}€</span>
                            <ChevronDown className={`h-4 w-4 text-[hsl(0,0%,55%)] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </div>
                        </button>

                        {/* Expanded: modifiers + actions */}
                        {isExpanded && (
                          <div className="px-5 pb-4 bg-[hsl(35,22%,96%)] border-t border-[hsl(35,18%,91%)]">
                            {/* Quick actions row */}
                            <div className="flex gap-2 py-3">
                              <button
                                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition-colors flex-1"
                                onClick={() => deleteItem(item.product.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Eliminar
                              </button>
                              <button
                                className="w-12 h-10 rounded-xl bg-[hsl(35,18%,88%)] text-[hsl(0,0%,35%)] font-bold text-lg hover:bg-[hsl(35,18%,82%)] flex items-center justify-center transition-colors"
                                onClick={() => removeItem(item.product.id)}
                              >
                                <Minus className="h-5 w-5" />
                              </button>
                              <button
                                className="w-12 h-10 rounded-xl bg-[hsl(142,35%,88%)] text-[hsl(142,50%,28%)] font-bold text-lg hover:bg-[hsl(142,35%,82%)] flex items-center justify-center transition-colors"
                                onClick={() => fastAddProduct(item.product)}
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                            </div>

                            {/* Modifier chips */}
                            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(0,0%,50%)] mb-2">
                              Modificadores
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {MODIFIERS.map((mod) => {
                                const isActive = (item.modifiers || []).find((m) => m.id === mod.id)
                                return (
                                  <button
                                    key={mod.id}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                      isActive
                                        ? "bg-[hsl(142,50%,28%)] text-white shadow-sm"
                                        : "bg-white border-2 border-[hsl(35,18%,85%)] text-[hsl(0,0%,30%)] hover:border-[hsl(142,40%,55%)]"
                                    }`}
                                    onClick={() =>
                                      addModifier(item.product.id, {
                                        id: mod.id,
                                        name: mod.name,
                                        priceAdjustment: mod.priceAdjustment,
                                      })
                                    }
                                  >
                                    {mod.name}
                                    {mod.priceAdjustment > 0 && (
                                      <span className="ml-1 opacity-60">+{mod.priceAdjustment.toFixed(2)}</span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Ticket Footer ── */}
            <div className="border-t-2 border-[hsl(35,18%,85%)] bg-white shrink-0">

              {/* Undo bar */}
              {undoStack.length > 0 && (
                <button
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[hsl(0,0%,45%)] hover:bg-[hsl(35,22%,96%)] border-b border-[hsl(35,18%,91%)] transition-colors"
                  onClick={handleUndo}
                >
                  <Undo2 className="h-4 w-4" />
                  Deshacer
                </button>
              )}

              {/* Total */}
              <div className="px-5 py-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold uppercase tracking-[0.15em] text-[hsl(0,0%,50%)]">
                    Total
                  </span>
                  <span className="text-3xl font-black text-[hsl(0,0%,5%)] tracking-tight">
                    {total.toFixed(2)}€
                  </span>
                </div>
              </div>

              {/* Payment buttons — BIG, easy to tap */}
              {order.length > 0 && (
                <div className="px-5 pb-4 space-y-3">
                  <div className="flex gap-3">
                    <button
                      className="flex-1 flex items-center justify-center gap-3 h-16 rounded-2xl bg-[hsl(142,50%,26%)] hover:bg-[hsl(142,50%,22%)] text-white font-bold text-base transition-all active:scale-[0.97] shadow-lg shadow-green-900/20 disabled:opacity-50"
                      onClick={() => { posMetricsTracker.recordTap(); generateReceipt("CASH") }}
                      disabled={processingOrder}
                    >
                      <DollarSign className="h-6 w-6" />
                      Efectivo
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center gap-3 h-16 rounded-2xl bg-[hsl(220,65%,48%)] hover:bg-[hsl(220,65%,42%)] text-white font-bold text-base transition-all active:scale-[0.97] shadow-lg shadow-blue-900/20 disabled:opacity-50"
                      onClick={() => { posMetricsTracker.recordTap(); generateReceipt("CARD") }}
                      disabled={processingOrder}
                    >
                      <CreditCard className="h-6 w-6" />
                      Tarjeta
                    </button>
                  </div>

                  {/* Secondary actions */}
                  <div className="flex gap-2">
                    <button
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[hsl(0,0%,40%)] hover:bg-[hsl(35,22%,93%)] transition-colors"
                      onClick={() => setShowPaymentModal(true)}
                    >
                      Clasificar
                    </button>
                    <button
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-50 transition-colors"
                      onClick={clearOrder}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              )}

              {/* Redemption validator — bonos son de Raíz (exam-pass); per-café en task #3 */}
              {user && orgId && isRaiz && (
                <div className="px-5 pb-4 border-t border-[hsl(35,18%,91%)] pt-3">
                  <RedemptionValidator user={user} orgId={orgId} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ OVERLAYS ═══════ */}

      {/* App Orders Panel */}
      {isRaiz && showAppOrders && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAppOrders(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="absolute top-4 right-4 z-10">
              <button
                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                onClick={() => setShowAppOrders(false)}
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <AppOrdersPanel />
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentMethodModal
          total={total}
          isRaiz={isRaiz}
          onSelect={(method, freq, role, custId, custName) => {
            setShowPaymentModal(false)
            generateReceipt(method, freq, role, custId, custName)
          }}
          onClose={() => setShowPaymentModal(false)}
        />
      )}

      {/* Grant Bono Modal */}
      {showGrantBonoModal && user && orgId && (
        <GrantBonoModal
          user={user}
          orgId={orgId}
          onClose={() => setShowGrantBonoModal(false)}
        />
      )}

      {/* Redeem Bono Modal */}
      {showRedeemBonoModal && user && orgId && (
        <RedeemBonoModal
          user={user}
          orgId={orgId}
          onClose={() => setShowRedeemBonoModal(false)}
        />
      )}

      {isRaiz && <OrderNotifications />}
      {/* Listener permanente de pedidos APP. Mantiene el badge del botón
          Smartphone actualizado y dispara toast + sonido al entrar uno
          nuevo, para que el barista reaccione sin abrir el panel. Solo Raíz. */}
      {isRaiz && <AppOrdersWatcher onCountChange={setActiveAppOrdersCount} />}
      <Toaster />
    </>
  )
}
