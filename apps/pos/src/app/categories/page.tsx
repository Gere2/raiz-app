"use client"

import { useEffect, useState } from "react"
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { RoleGuard } from "@/components/role-guard"
import { Plus, Edit2, Trash2, X, Check, GripVertical, Package } from "lucide-react"

type Category = {
  id: string
  name: string
  name_en?: string
  emoji?: string
  order?: number
  active?: boolean
  productCount?: number
}

const EMOJI_OPTIONS = ["☕", "🍵", "🥤", "🧊", "🥐", "🍪", "🍞", "🥪", "🍳", "🍊", "🥤", "🍰", "🍽️", "⭐", "🏷️", "✨"]

export default function CategoriesPage() {
  return (
    <RoleGuard allowedRoles={["admin"]} fallbackRoute="/pos">
      <CategoriesContent />
    </RoleGuard>
  )
}

function CategoriesContent() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState({ name: "", name_en: "", emoji: "☕", order: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchCategories = async () => {
    try {
      const [catSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, "categories")),
        getDocs(collection(db, "products")),
      ])
      const prodCounts = new Map<string, number>()
      prodSnap.docs.forEach((d) => {
        const cat = d.data().category || ""
        prodCounts.set(cat, (prodCounts.get(cat) || 0) + 1)
      })
      const cats = catSnap.docs.map((d) => ({
        id: d.id, ...d.data(), productCount: prodCounts.get(d.id) || 0,
      })) as Category[]
      cats.sort((a, b) => (a.order || 0) - (b.order || 0))
      setCategories(cats)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCategories() }, [])

  const resetForm = () => { setForm({ name: "", name_en: "", emoji: "☕", order: 0 }); setEditing(null); setShowForm(false); setError(null) }

  const startEdit = (cat: Category) => {
    setEditing(cat)
    setForm({ name: cat.name, name_en: cat.name_en || "", emoji: cat.emoji || "☕", order: cat.order || 0 })
    setShowForm(true); setError(null)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError("El nombre es obligatorio"); return }
    const dup = categories.find((c) => c.name.toLowerCase() === form.name.trim().toLowerCase() && c.id !== editing?.id)
    if (dup) { setError("Ya existe una categoría con ese nombre"); return }
    setSaving(true); setError(null)
    try {
      const data = { name: form.name.trim(), name_en: form.name_en.trim() || "", emoji: form.emoji, order: form.order, active: true, updatedAt: serverTimestamp() }
      if (editing) { await updateDoc(doc(db, "categories", editing.id), data) }
      else { await addDoc(collection(db, "categories"), { ...data, createdAt: serverTimestamp() }) }
      await fetchCategories(); resetForm()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (catId: string) => {
    try { await deleteDoc(doc(db, "categories", catId)); await fetchCategories(); setDeleteConfirm(null) }
    catch (err) { console.error(err) }
  }

  return (
    <AuthenticatedLayout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
            <p className="text-sm text-gray-500">{categories.length} categoría{categories.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700">
            <Plus className="h-4 w-4" />Nueva categoría
          </button>
        </div>

        {showForm && (
          <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? "Editar categoría" : "Nueva categoría"}</h2>
              <button onClick={resetForm} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200"><X className="h-5 w-5" /></button>
            </div>
            {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div className="grid gap-4">
              <div className="grid grid-cols-[auto,1fr] gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emoji</label>
                  <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                    {EMOJI_OPTIONS.map((e) => (
                      <button key={e} onClick={() => setForm((p) => ({ ...p, emoji: e }))} className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-all ${form.emoji === e ? "bg-green-600 shadow-sm scale-110" : "bg-white border border-gray-200 hover:border-gray-300"}`}>{e}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre (español)</label>
                    <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Cafés, Bollería..." className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre (inglés)</label>
                    <input value={form.name_en} onChange={(e) => setForm((p) => ({ ...p, name_en: e.target.value }))} placeholder="Ej: Coffee, Pastry..." className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
                    <input type="number" value={form.order} onChange={(e) => setForm((p) => ({ ...p, order: parseInt(e.target.value) || 0 }))} className="w-24 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={resetForm} className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Guardando...</> : <><Check className="h-4 w-4" />{editing ? "Guardar" : "Crear"}</>}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" /></div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center"><p className="text-4xl mb-3">📂</p><p className="text-gray-500">No hay categorías. Crea la primera.</p></div>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => {
              const isDeleting = deleteConfirm === cat.id
              return (
                <div key={cat.id} className="rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-sm">
                  {isDeleting ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-red-600 font-medium">¿Eliminar "{cat.name}"?</p>
                        {(cat.productCount || 0) > 0 && <p className="text-xs text-red-400 mt-0.5">⚠️ Tiene {cat.productCount} productos asociados</p>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteConfirm(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">No</button>
                        <button onClick={() => handleDelete(cat.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Eliminar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{cat.emoji || "☕"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{cat.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {cat.name_en && <span className="text-xs text-gray-400">🇬🇧 {cat.name_en}</span>}
                          <span className="flex items-center gap-1 text-xs text-gray-400"><Package className="h-3 w-3" />{cat.productCount || 0} productos</span>
                          {typeof cat.order === "number" && <span className="text-xs text-gray-300">#{cat.order}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(cat)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteConfirm(cat.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  )
}
