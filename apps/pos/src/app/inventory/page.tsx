"use client"

import { useEffect, useState, useMemo } from "react"
import { getDocs, writeBatch } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { orgCollection, orgDoc } from "@/lib/org-scope"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { RoleGuard } from "@/components/role-guard"
import {
  Package, AlertTriangle, CheckCircle, XCircle,
  Search, Filter, Save, RefreshCw, Minus, Plus,
} from "lucide-react"

type ProductStock = {
  id: string
  name: string
  category: string
  categoryName: string
  price: number
  available: boolean
  stock?: number
  minStock?: number
  imageUrl?: string
}

export default function InventoryPage() {
  return (
    <RoleGuard allowedRoles={["admin"]} fallbackRoute="/pos">
      <InventoryContent />
    </RoleGuard>
  )
}

function InventoryContent() {
  const { user } = useAuth()
  const { orgId } = useOrg(user)
  const [products, setProducts] = useState<ProductStock[]>([])
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [filterCat, setFilterCat] = useState("__all__")
  const [filterStock, setFilterStock] = useState<"all" | "low" | "out">("all")
  const [changes, setChanges] = useState<Map<string, Partial<ProductStock>>>(new Map())
  const [saved, setSaved] = useState(false)

  const fetchData = async () => {
    if (!orgId) return
    try {
      const [prodSnap, catSnap] = await Promise.all([
        getDocs(orgCollection(orgId, "products")),
        getDocs(orgCollection(orgId, "categories")),
      ])
      const catMap: Record<string, string> = {}
      catSnap.docs.forEach((d) => { catMap[d.id] = d.data().name || d.id })
      setCategories(catMap)

      const prods = prodSnap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id, name: data.name || "", category: data.category || "",
          categoryName: catMap[data.category] || data.category || "Sin categoría",
          price: data.price || 0, available: data.available !== false,
          stock: typeof data.stock === "number" ? data.stock : undefined,
          minStock: typeof data.minStock === "number" ? data.minStock : 5,
        } as ProductStock
      }).sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.name.localeCompare(b.name))
      setProducts(prods)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [orgId])

  const updateProduct = (id: string, field: string, value: any) => {
    setChanges((prev) => {
      const next = new Map(prev)
      const existing = next.get(id) || {}
      next.set(id, { ...existing, [field]: value })
      return next
    })
    setSaved(false)
  }

  const getEffective = (product: ProductStock): ProductStock => {
    const change = changes.get(product.id)
    if (!change) return product
    return { ...product, ...change }
  }

  const saveAll = async () => {
    if (changes.size === 0) return
    setSaving(true)
    try {
      const batch = writeBatch(db)
      changes.forEach((change, id) => {
        const ref = orgDoc(orgId, "products", id)
        batch.update(ref, change)
      })
      await batch.commit()
      setChanges(new Map())
      setSaved(true)
      await fetchData()
      setTimeout(() => setSaved(false), 2000)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const toggleAvailability = (id: string, current: boolean) => {
    updateProduct(id, "available", !current)
  }

  const adjustStock = (id: string, currentStock: number | undefined, delta: number) => {
    const current = currentStock ?? 0
    const newStock = Math.max(0, current + delta)
    updateProduct(id, "stock", newStock)
  }

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const eff = getEffective(p)
      if (search && !eff.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterCat !== "__all__" && eff.category !== filterCat) return false
      if (filterStock === "low" && (eff.stock === undefined || eff.stock > (eff.minStock || 5))) return false
      if (filterStock === "out" && eff.available !== false) return false
      return true
    })
  }, [products, search, filterCat, filterStock, changes])

  const lowStockCount = products.filter((p) => {
    const eff = getEffective(p)
    return eff.stock !== undefined && eff.stock <= (eff.minStock || 5) && eff.stock > 0
  }).length

  const outOfStockCount = products.filter((p) => !getEffective(p).available || getEffective(p).stock === 0).length

  const categoryList = Object.entries(categories).sort((a, b) => a[1].localeCompare(b[1]))

  return (
    <AuthenticatedLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
            <p className="text-sm text-gray-500">{products.length} productos</p>
          </div>
          <div className="flex items-center gap-2">
            {changes.size > 0 && (
              <span className="text-xs text-amber-600 font-medium bg-amber-50 rounded-lg px-2 py-1">
                {changes.size} cambio{changes.size !== 1 ? "s" : ""} sin guardar
              </span>
            )}
            {saved && <span className="text-xs text-green-600 font-medium">✅ Guardado</span>}
            <button onClick={saveAll} disabled={changes.size === 0 || saving}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${changes.size > 0 ? "bg-green-600 text-white hover:bg-green-700 shadow-sm" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Guardando...</> : <><Save className="h-4 w-4" />Guardar</>}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {(lowStockCount > 0 || outOfStockCount > 0) && (
          <div className="flex gap-3">
            {lowStockCount > 0 && (
              <button onClick={() => setFilterStock("low")} className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 hover:bg-amber-100 transition-colors">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">{lowStockCount} stock bajo</span>
              </button>
            )}
            {outOfStockCount > 0 && (
              <button onClick={() => setFilterStock("out")} className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 hover:bg-red-100 transition-colors">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">{outOfStockCount} agotado{outOfStockCount !== 1 ? "s" : ""}</span>
              </button>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..."
              className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="__all__">Todas las categorías</option>
            {categoryList.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <div className="flex rounded-xl bg-gray-100 p-1">
            {([["all", "Todos"], ["low", "⚠️ Bajo"], ["out", "❌ Agotado"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => setFilterStock(val)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${filterStock === val ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Product list */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center"><p className="text-4xl mb-3">📦</p><p className="text-gray-500">No hay productos que coincidan</p></div>
        ) : (
          <div className="space-y-1">
            {filtered.map((product) => {
              const eff = getEffective(product)
              const isLow = eff.stock !== undefined && eff.stock <= (eff.minStock || 5) && eff.stock > 0
              const isOut = eff.stock === 0 || !eff.available
              const hasChange = changes.has(product.id)

              return (
                <div key={product.id} className={`rounded-xl border p-3 transition-all ${hasChange ? "border-amber-300 bg-amber-50/30" : isOut ? "border-red-200 bg-red-50/30" : isLow ? "border-amber-200 bg-amber-50/20" : "border-gray-200 bg-white"}`}>
                  <div className="flex items-center gap-3">
                    {/* Availability toggle */}
                    <button onClick={() => toggleAvailability(product.id, eff.available)}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${eff.available ? "bg-green-100 text-green-600 hover:bg-green-200" : "bg-red-100 text-red-500 hover:bg-red-200"}`}>
                      {eff.available ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${eff.available ? "text-gray-900" : "text-gray-400 line-through"}`}>{eff.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{eff.categoryName}</span>
                        <span className="text-xs font-medium text-gray-600">{eff.price.toFixed(2)} €</span>
                      </div>
                    </div>

                    {/* Stock controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => adjustStock(product.id, eff.stock, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 active:scale-95">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <div className="w-14 text-center">
                        <input
                          type="number"
                          value={eff.stock ?? ""}
                          onChange={(e) => updateProduct(product.id, "stock", parseInt(e.target.value) || 0)}
                          placeholder="∞"
                          className={`w-full text-center text-sm font-bold border-none outline-none bg-transparent ${isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-gray-900"}`}
                        />
                        <p className="text-[10px] text-gray-400 -mt-0.5">stock</p>
                      </div>
                      <button onClick={() => adjustStock(product.id, eff.stock, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 active:scale-95">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Status badge */}
                    <div className="w-16 text-right shrink-0">
                      {isOut ? <span className="text-xs font-semibold text-red-600 bg-red-100 rounded-md px-2 py-0.5">Agotado</span>
                        : isLow ? <span className="text-xs font-semibold text-amber-600 bg-amber-100 rounded-md px-2 py-0.5">Bajo</span>
                        : <span className="text-xs text-green-600 font-medium">OK</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  )
}
