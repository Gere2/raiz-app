"use client";
import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react"; import { collection, getDocs } from "firebase/firestore"; import { db } from "@/lib/firebase"; import { Product, MilkOption } from "@/types"; import { useCart } from "@/components/cart-provider"; import { useLanguage } from "@/components/language-provider"; import { translateProduct, translateCategory } from "@/lib/i18n/product-translations"; import { toast } from "sonner"; import { CategoryIcon, ProductFallbackIcon, MilkIcon } from "@/lib/icons"; import { UtensilsCrossed, Leaf, Plus, MapPin } from "lucide-react"; import Image from "next/image"
import dynamic from "next/dynamic"

// La card del bono no es crítica para el catálogo. Cargarla dinámicamente
// (ssr=false) saca ~10 KB del bundle inicial y evita que la home espere a
// que el chunk del bono llegue.
const ExamPassCard = dynamic(
  () =>
    import("@/components/exam-pass/ExamPassCard").then((m) => ({
      default: m.ExamPassCard,
    })),
  {
    ssr: false,
    // Mientras carga el chunk, dejamos un hueco muy compacto. La card real
    // ya tiene su propio render optimista cuando llega.
    loading: () => <div className="h-32" />,
  },
)

/** Palabras clave que indican que la bebida lleva leche */
const MILK_KEYWORDS = ["latte", "cappuccino", "capuchino", "con leche", "cortado", "flat white", "mocca", "mocha", "chai latte", "matcha latte", "chocolate caliente", "hot chocolate", "bombón"]
function drinkNeedsMilk(name: string): boolean {
  const lower = name.toLowerCase()
  return MILK_KEYWORDS.some(kw => lower.includes(kw))
}

// Price bounds validation: extras should be between 0 and max price (1000€)
const MAX_PRODUCT_PRICE = 1000;
const MIN_PRODUCT_PRICE = 0;

const MILK_OPTIONS: { id: MilkOption; label: string; labelEn: string; extra: number }[] = [
  { id: "normal", label: "Leche normal", labelEn: "Regular milk", extra: 0 },
  { id: "sin-lactosa", label: "Sin lactosa / semidesnatada", labelEn: "Lactose-free / semi-skimmed", extra: 0 },
  { id: "almendras", label: "Leche de almendras", labelEn: "Almond milk", extra: 0 },
  { id: "avena", label: "Leche de avena", labelEn: "Oat milk", extra: 0 },
];

function looksLikeFirestoreId(str: string): boolean { return /^[a-zA-Z0-9]{15,30}$/.test(str) }

// Type guard to validate Product structure at runtime
function isValidProduct(data: unknown): data is Product {
  return !!(
    data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).id === "string" &&
    typeof (data as Record<string, unknown>).name === "string" &&
    typeof (data as Record<string, unknown>).price === "number" &&
    ((data as Record<string, unknown>).price as number) >= 0
  )
}

// ── Cache local del catálogo (render optimista) ──────────────────
//
// Antes la home esperaba a Firestore en cada visita. Ahora pintamos al
// instante el último catálogo conocido y refrescamos en background. Si
// Firestore tarda (red lenta, cold start), el cliente no ve un esqueleto.
//
// TTL conservador: 30 min para `categories` (rara vez cambian) y 5 min
// para `products` (más volátiles por `available`/precio). Si se queda
// stale en local, la próxima visita lo refresca igual; lo crítico es no
// bloquear el primer paint.

const CATALOG_CACHE_KEY = "raiz_catalog_v1"
const CATALOG_TTL_MS = 5 * 60 * 1000

interface CatalogCache {
  ts: number
  products: Product[]
  categoryMap: Record<string, string>
}

function readCatalogCache(): CatalogCache | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CatalogCache
    // Validamos products; si está corrupto, descartamos.
    if (!Array.isArray(parsed.products) || !parsed.products.every(isValidProduct)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCatalogCache(data: CatalogCache): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data))
  } catch {}
}

export default function CatalogPage() {
  // Render optimista: si tenemos cache, arrancamos con esos datos. La home
  // se ve completa al instante; el refresh ocurre en background.
  const initialCache = typeof window !== "undefined" ? readCatalogCache() : null
  const [products, setProducts] = useState<Product[]>(initialCache?.products ?? []); const [categoryMap, setCategoryMap] = useState<Record<string, string>>(initialCache?.categoryMap ?? {}); const [loading, setLoading] = useState(!initialCache); const [activeCategory, setActiveCategory] = useState<string>("__all__")
  const { addItem } = useCart(); const { locale, t } = useLanguage(); const sectionRefs = useRef<Record<string, HTMLElement | null>>({}); const milkPickerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const isEn = locale === "en"
  const [milkPickerProduct, setMilkPickerProduct] = useState<Product | null>(null)

  useEffect(() => {
    // Si el cache es fresco, NO refrescamos: ahorramos dos round-trips a
    // Firestore en cada visita. Solo recargamos si está stale o ausente.
    const cache = readCatalogCache()
    const isFresh = cache && Date.now() - cache.ts < CATALOG_TTL_MS
    if (isFresh) {
      setLoading(false)
      return
    }

    async function fetchData() {
      try {
        const catSnap = await getDocs(collection(db, "categories")); const catMap: Record<string, string> = {}
        catSnap.docs.forEach((doc) => { catMap[doc.id] = doc.data().name || doc.id }); setCategoryMap(catMap)
        // Limit initial product load to 50 to avoid performance issues
        let query, limit
        try {
          const firestore = await import("firebase/firestore");
          query = firestore.query
          limit = firestore.limit
        } catch (importError) {
          console.error("[Catalog] Error importing Firestore:", importError)
          // Fallback: use global if available (shouldn't normally happen)
          throw new Error("Firestore import failed")
        }
        const prodSnap = await getDocs(query(collection(db, "products"), limit(50)))
        const allProds = prodSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter(isValidProduct) // Validate each document at runtime
        const visible = allProds.filter((p) => p.available !== false)
        setProducts(visible)
        // Persistimos para la siguiente visita.
        writeCatalogCache({ ts: Date.now(), products: visible, categoryMap: catMap })
      } catch (error) {
        console.error("[Catalog] Error loading data:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const categories = products.reduce((acc, product) => {
    const rawCat = product.category || ""; let catName = categoryMap[rawCat]
    if (!catName) { catName = looksLikeFirestoreId(rawCat) ? "Otros" : (rawCat || "Otros") }
    if (!acc[catName]) acc[catName] = []; acc[catName].push(product); return acc
  }, {} as Record<string, Product[]>)

  const categoryNames = Object.keys(categories)
  const allLabel = t("catalog.all")

  const handleCategoryClick = (name: string) => {
    setActiveCategory(name)
    if (name === "__all__") window.scrollTo({ top: 0, behavior: "smooth" })
    else sectionRefs.current[name]?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handleAdd = useCallback((product: Product) => {
    if (drinkNeedsMilk(product.name)) {
      setMilkPickerProduct(product)
      return
    }
    addItem(product)
    const name = translateProduct(product.name, locale, (product as unknown as Record<string, string>).name_en)
    toast.dismiss()
    toast.success(`${name} ${t("catalog.added")}`, { duration: 3000 })
  }, [addItem, locale, t])

  const handleMilkSelect = (milk: MilkOption) => {
    if (!milkPickerProduct) return
    const milkInfo = MILK_OPTIONS.find(m => m.id === milk)!

    // Bounds check: ensure final price is within valid range
    let finalPrice = milkPickerProduct.price + (milkInfo.extra || 0)
    finalPrice = Math.max(MIN_PRODUCT_PRICE, Math.min(MAX_PRODUCT_PRICE, finalPrice))
    finalPrice = +(finalPrice).toFixed(2)

    const productWithExtra = finalPrice !== milkPickerProduct.price
      ? { ...milkPickerProduct, price: finalPrice }
      : milkPickerProduct
    addItem(productWithExtra, undefined, { milk })
    const name = translateProduct(milkPickerProduct.name, locale, (milkPickerProduct as unknown as Record<string, string>).name_en)
    const milkLabel = isEn ? milkInfo.labelEn : milkInfo.label
    toast.dismiss()
    toast.success(`${name} · ${milkLabel}`, { duration: 3000 })
    setMilkPickerProduct(null)
  }

  const displayCategories = activeCategory === "__all__" ? Object.entries(categories) : Object.entries(categories).filter(([name]) => name === activeCategory)

  // Default skeleton count - shows typical number of initial products
  const SKELETON_COUNT = 6;

  if (loading) return (
    <div className="space-y-5 animate-fade-up">
      <div><div className="skeleton h-8 w-48 mb-2" /><div className="skeleton h-4 w-64" /></div>
      <div className="flex gap-2">{[1,2,3,4].map((i) => <div key={i} className="skeleton h-10 w-24 rounded-full" />)}</div>
      <div className="space-y-2">{Array.from({ length: SKELETON_COUNT }).map((_, i) => <div key={i} className="skeleton h-20 w-full rounded-2xl" />)}</div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="animate-fade-up"><h1 className="text-2xl font-bold text-brand-900">{t("catalog.greeting")}</h1><p className="mt-1 text-sm text-brand-500">{t("catalog.subtitle")}</p></div>
      {/* Bono Supervivencia Exámenes — la card devuelve null sin sesión, así que no rompe el catálogo público. */}
      <ExamPassCard variant="compact" />
      <div className="sticky top-14 z-40 -mx-4 bg-brand-50/95 backdrop-blur-md px-4 py-2.5 border-b border-brand-100/50">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button onClick={() => handleCategoryClick("__all__")} className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all ${activeCategory === "__all__" ? "bg-brand-900 text-brand-50 shadow-sm" : "bg-white text-brand-600 border border-brand-200"}`}><UtensilsCrossed className="h-4 w-4" />{allLabel}</button>
          {categoryNames.map((name) => { const isActive = activeCategory === name; const displayName = translateCategory(name, locale); return (
            <button key={name} onClick={() => handleCategoryClick(name)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all ${isActive ? "bg-brand-900 text-brand-50 shadow-sm" : "bg-white text-brand-600 border border-brand-200"}`}><CategoryIcon name={name} className="h-4 w-4" />{displayName}</button>
          )})}
        </div>
      </div>
      <div className="space-y-8 stagger-children">
        {displayCategories.map(([category, items]) => { const catDisplay = translateCategory(category, locale); return (
          <section key={category} ref={(el) => { sectionRefs.current[category] = el }} className="scroll-mt-28">
            <div className="mb-3 flex items-center gap-3"><CategoryIcon name={category} className="h-5 w-5 text-brand-500" /><h2 className="text-base font-bold text-brand-900">{catDisplay}</h2><div className="h-px flex-1 bg-brand-200/50" /><span className="text-xs text-brand-400">{items.length}</span></div>
            <div className="space-y-2">{items.map((product) => <ProductCard key={product.id} product={product} onAdd={handleAdd} locale={locale} triggerRef={milkPickerTriggerRef} />)}</div>
          </section>
        )})}
      </div>
      {products.length === 0 && <div className="py-16 text-center"><div className="flex justify-center mb-3"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100/60"><Leaf className="h-10 w-10 text-brand-300" /></div></div><p className="text-brand-500">{t("catalog.empty")}</p></div>}

      {/* Milk picker modal */}
      {milkPickerProduct && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-up" onClick={() => { setMilkPickerProduct(null); milkPickerTriggerRef.current?.focus() }} role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8 shadow-2xl border-t border-brand-200" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-brand-200" />
            <p className="text-base font-bold text-brand-900 mb-1">
              {translateProduct(milkPickerProduct.name, locale, (milkPickerProduct as unknown as Record<string, string>).name_en)}
            </p>
            <p className="text-xs text-brand-400 mb-4">
              {t("catalog.milk")}
            </p>
            <div className="space-y-2">
              {MILK_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleMilkSelect(opt.id)}
                  aria-label={isEn ? `Select ${opt.labelEn}` : `Seleccionar ${opt.label}`}
                  className="flex w-full items-center gap-3 rounded-2xl border border-brand-200/70 bg-white p-3.5 text-left transition-all hover:border-leaf-400/80 hover:bg-white hover:shadow-sm hover:border-l-2 hover:border-l-leaf-400 active:scale-[0.98]"
                >
                  <MilkIcon milk={opt.id} className="h-5 w-5 text-brand-600" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-brand-900">{isEn ? opt.labelEn : opt.label}</p>
                  </div>
                  {opt.extra > 0 && (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                      +{opt.extra.toFixed(2)} €
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button onClick={() => { setMilkPickerProduct(null); milkPickerTriggerRef.current?.focus() }} className="mt-4 w-full text-center text-xs text-brand-400 hover:text-brand-600">
              {isEn ? "Cancel" : "Cancelar"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface ProductCardProps {
  imageUrl?: string
  name_en?: string
}

const ProductCard = memo(function ProductCard({ product, onAdd, locale, triggerRef }: { product: Product & ProductCardProps; onAdd: (p: Product) => void; locale: "es" | "en"; triggerRef: React.MutableRefObject<HTMLButtonElement | null> }) {
  const [adding, setAdding] = useState(false)
  const [imgError, setImgError] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const handleAdd = useCallback(() => {
    triggerRef.current = buttonRef.current
    setAdding(true)
    onAdd(product)
    const timer = setTimeout(() => setAdding(false), 300)
    return () => clearTimeout(timer)
  }, [product, onAdd, triggerRef])
  const displayName = translateProduct(product.name, locale, product.name_en)
  const imageUrl = product.imageUrl
  const addLabel = locale === "es" ? `Añadir ${displayName}` : `Add ${displayName}`

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-brand-200/70 bg-white p-3 transition-all hover:shadow-md hover:border-brand-300/60 active:scale-[0.99]">
      {/* Product image */}
      {imageUrl && !imgError ? (
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-100">
          <Image src={imageUrl} alt={displayName} width={64} height={64} onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        </div>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-100/60">
          <ProductFallbackIcon productName={product.name} category={product.category} className="h-8 w-8 text-brand-300" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[15px] text-brand-900 leading-snug truncate" title={displayName}>{displayName}</p>
        {locale === "en" && displayName !== product.name && <p className="text-[11px] text-brand-400 italic truncate" title={product.name}>{product.name}</p>}
        {product.origin && product.origin.trim() !== "" && product.origin !== "." && <p className="mt-0.5 text-xs text-brand-400 flex items-center gap-1"><MapPin className="h-3 w-3" />{product.origin}</p>}
      </div>

      {/* Price + Add */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[15px] font-bold text-brand-800 tabular-nums">{useMemo(() => product.price.toFixed(2), [product.price])} €</span>
        <button ref={buttonRef} onClick={handleAdd} aria-label={addLabel} className={`flex h-9 w-9 items-center justify-center rounded-lg text-white transition-all active:scale-90 ${adding ? "bg-leaf-500 scale-110" : "bg-leaf-600 hover:bg-leaf-700"}`}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  )
})