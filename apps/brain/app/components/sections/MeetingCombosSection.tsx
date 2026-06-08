"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../../lib/authed-fetch"
import { T, page, pageTitle, pageSub, tableWrap, tableHead, tableRow, btnSmall, btnPrimary, input, modalTitle } from "../theme"
import { Overlay, Fld } from "../ui"

/* ── Types ── */

type SlotOption = {
  name: string
  name_en?: string
  productId?: string
  extraPrice?: number
}

type ComboSlot = {
  label: string
  label_en?: string
  category: "beverage" | "food" | "snack"
  options: SlotOption[]
  quantity: number
}

type MeetingCombo = {
  id: string
  name: string
  name_en?: string
  description: string
  description_en?: string
  basePrice: number
  servesUpTo: number
  slots: ComboSlot[]
  available: boolean
  popular?: boolean
  order?: number
}

type DBProduct = {
  id: string
  name: string
  name_en?: string
  price: number
  category: string
  categoryName?: string
  available?: boolean
}

type DBCategory = {
  id: string
  name: string
}

interface Props {
  user: User
  orgId: string
}

const CATEGORY_LABELS: Record<string, string> = {
  beverage: "Bebida",
  food: "Comida",
  snack: "Snack",
}

/** Keywords to auto-group products into slot categories */
const SLOT_CATEGORY_KEYWORDS: Record<string, string[]> = {
  beverage: ["café", "cafe", "cafes", "cafés", "bebida", "bebidas", "drink", "drinks", "tea", "té", "zumo", "juice", "chocolate"],
  food: ["bollería", "bolleria", "comida", "food", "tostada", "toast", "croissant", "desayuno", "breakfast", "sandwich"],
  snack: ["snack", "snacks", "galleta", "cookie", "dulce", "sweet", "muffin", "brownie", "postre", "dessert"],
}

const emptySlot = (): ComboSlot => ({
  label: "",
  label_en: "",
  category: "beverage",
  options: [],
  quantity: 1,
})

const emptyCombo = (): Omit<MeetingCombo, "id"> => ({
  name: "",
  name_en: "",
  description: "",
  description_en: "",
  basePrice: 0,
  servesUpTo: 2,
  slots: [emptySlot()],
  available: true,
  popular: false,
  order: 0,
})

/* ── Inline Styles ── */
const s = {
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as React.CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 } as React.CSSProperties,
  slotBox: {
    background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`,
    padding: 16, marginBottom: 12,
  } as React.CSSProperties,
  slotHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 12,
  } as React.CSSProperties,
  smallInput: {
    padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`,
    background: T.surface, color: T.text, fontFamily: T.font, fontSize: 13,
    outline: "none", boxSizing: "border-box" as const, width: "100%",
  } as React.CSSProperties,
  removeBtn: {
    padding: 4, border: "none", background: "transparent",
    color: T.dim, cursor: "pointer", fontSize: 16, borderRadius: 6,
  } as React.CSSProperties,
  pillBadge: (color: string, bg: string) => ({
    fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
    display: "inline-block", color, background: bg,
  }) as React.CSSProperties,
  productChip: (selected: boolean) => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
    border: `2px solid ${selected ? "#15803d" : T.border}`,
    background: selected ? T.successBg : T.surface,
    color: selected ? "#15803d" : T.muted,
    cursor: "pointer", transition: "all 0.15s", fontFamily: T.font,
  }) as React.CSSProperties,
}

export default function MeetingCombosSection({ user, orgId }: Props) {
  const [combos, setCombos] = useState<MeetingCombo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Products from DB
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([])
  const [dbCategories, setDbCategories] = useState<DBCategory[]>([])
  const [productsLoaded, setProductsLoaded] = useState(false)

  // Modal state
  const [editing, setEditing] = useState<MeetingCombo | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<Omit<MeetingCombo, "id">>(emptyCombo())

  /* ── Fetch combos ── */
  const fetchCombos = useCallback(async () => {
    setLoading(true)
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/combos`)
      const d = await r.json()
      setCombos(d.combos || [])
    } catch (e) {
      console.error("Error fetching combos:", e)
    }
    setLoading(false)
  }, [user, orgId])

  /* ── Fetch products from POS ── */
  const fetchProducts = useCallback(async () => {
    try {
      const r = await authedFetch(user, `/api/pos/products?orgId=${orgId}`)
      const d = await r.json()
      setDbProducts((d.products || []).filter((p: DBProduct) => p.available !== false))
      setDbCategories(d.categories || [])
      setProductsLoaded(true)
    } catch (e) {
      console.error("Error fetching products:", e)
    }
  }, [user])

  useEffect(() => { fetchCombos(); fetchProducts() }, [fetchCombos, fetchProducts])

  /* ── Get products matching a slot category ── */
  const getProductsForCategory = useCallback((slotCategory: string): DBProduct[] => {
    const keywords = SLOT_CATEGORY_KEYWORDS[slotCategory] || []
    if (keywords.length === 0) return dbProducts

    // Build category name map
    const catNameMap: Record<string, string> = {}
    dbCategories.forEach(c => { catNameMap[c.id] = c.name.toLowerCase() })

    return dbProducts.filter(p => {
      const catName = (p.categoryName || catNameMap[p.category] || "").toLowerCase()
      const productNameLower = p.name.toLowerCase()
      return keywords.some(kw => catName.includes(kw) || productNameLower.includes(kw))
    })
  }, [dbProducts, dbCategories])

  /* ── Toggle available ── */
  const toggleAvailable = async (combo: MeetingCombo) => {
    try {
      await authedFetch(user, `/api/org/${orgId}/combos/${combo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available: !combo.available }),
      })
      setCombos(prev => prev.map(c => c.id === combo.id ? { ...c, available: !c.available } : c))
    } catch (e) { console.error(e) }
  }

  /* ── Toggle popular ── */
  const togglePopular = async (combo: MeetingCombo) => {
    try {
      await authedFetch(user, `/api/org/${orgId}/combos/${combo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ popular: !combo.popular }),
      })
      setCombos(prev => prev.map(c => c.id === combo.id ? { ...c, popular: !c.popular } : c))
    } catch (e) { console.error(e) }
  }

  /* ── Delete ── */
  const deleteCombo = async (id: string) => {
    if (!confirm("¿Eliminar este combo?")) return
    try {
      await authedFetch(user, `/api/org/${orgId}/combos/${id}`, { method: "DELETE" })
      setCombos(prev => prev.filter(c => c.id !== id))
    } catch (e) { console.error(e) }
  }

  /* ── Open create ── */
  const openCreate = () => {
    setForm(emptyCombo())
    setEditing(null)
    setCreating(true)
  }

  /* ── Open edit ── */
  const openEdit = (combo: MeetingCombo) => {
    setForm({
      name: combo.name,
      name_en: combo.name_en || "",
      description: combo.description,
      description_en: combo.description_en || "",
      basePrice: combo.basePrice,
      servesUpTo: combo.servesUpTo,
      slots: combo.slots?.length ? combo.slots.map(sl => ({
        ...sl,
        options: sl.options?.length ? sl.options.map(op => ({ ...op })) : [],
      })) : [emptySlot()],
      available: combo.available,
      popular: combo.popular || false,
      order: combo.order || 0,
    })
    setEditing(combo)
    setCreating(true)
  }

  /* ── Save (create or update) ── */
  const saveCombo = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await authedFetch(user, `/api/org/${orgId}/combos/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      } else {
        await authedFetch(user, `/api/org/${orgId}/combos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      }
      await fetchCombos()
      setCreating(false)
      setEditing(null)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  /* ── Slot helpers ── */
  const updateSlot = (idx: number, patch: Partial<ComboSlot>) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map((sl, i) => i === idx ? { ...sl, ...patch } : sl),
    }))
  }

  const addSlot = () => {
    setForm(prev => ({ ...prev, slots: [...prev.slots, emptySlot()] }))
  }

  const removeSlot = (idx: number) => {
    setForm(prev => ({ ...prev, slots: prev.slots.filter((_, i) => i !== idx) }))
  }

  /* ── Toggle product in slot options ── */
  const toggleProductInSlot = (slotIdx: number, product: DBProduct) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map((sl, si) => {
        if (si !== slotIdx) return sl
        const existing = sl.options.findIndex(op => op.productId === product.id)
        if (existing >= 0) {
          // Remove
          return { ...sl, options: sl.options.filter((_, oi) => oi !== existing) }
        } else {
          // Add
          return {
            ...sl,
            options: [...sl.options, {
              name: product.name,
              name_en: product.name_en || "",
              productId: product.id,
              extraPrice: 0,
            }],
          }
        }
      }),
    }))
  }

  /* ── Update extra price for an option ── */
  const updateOptionExtraPrice = (slotIdx: number, optIdx: number, extraPrice: number) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map((sl, si) =>
        si === slotIdx
          ? { ...sl, options: sl.options.map((op, oi) => oi === optIdx ? { ...op, extraPrice } : op) }
          : sl
      ),
    }))
  }

  /* ── Remove option ── */
  const removeOption = (slotIdx: number, optIdx: number) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map((sl, si) =>
        si === slotIdx ? { ...sl, options: sl.options.filter((_, oi) => oi !== optIdx) } : sl
      ),
    }))
  }

  /* ── Close modal ── */
  const closeModal = () => {
    setCreating(false)
    setEditing(null)
  }

  /* ── Find product name by ID ── */
  const getProductName = (productId: string) => {
    const p = dbProducts.find(pr => pr.id === productId)
    return p ? p.name : productId
  }

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h1 style={pageTitle}>Combos Profesores</h1>
          <p style={pageSub}>Gestiona los combos disponibles para pedidos de profesores · {dbProducts.length} productos cargados</p>
        </div>
        <button onClick={openCreate} style={{ ...btnSmall, color: T.accent, borderColor: T.accent40 }}>
          + Nuevo combo
        </button>
      </div>

      {/* Combos table */}
      <div style={tableWrap}>
        <div style={{ ...tableHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Catálogo de combos ({combos.length})</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: T.dim }}>Cargando...</div>
        ) : combos.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: T.dim }}>
            No hay combos. Crea el primero con el botón de arriba.
          </div>
        ) : (
          combos.map(combo => (
            <div
              key={combo.id}
              style={{
                ...tableRow,
                display: "grid",
                gridTemplateColumns: "2fr 80px 80px 100px 60px 60px 40px",
                alignItems: "center",
                opacity: combo.available ? 1 : 0.5,
                cursor: "pointer",
              }}
              onClick={() => openEdit(combo)}
            >
              {/* Name + description */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                  {combo.name}
                  {combo.popular && (
                    <span style={{ ...s.pillBadge("#92400e", "#fef3c7"), marginLeft: 8 }}>Popular</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{combo.description}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {(combo.slots || []).map((slot, si) => (
                    <span
                      key={si}
                      style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 5,
                        background: T.infoBg, color: T.info, fontWeight: 500,
                      }}
                    >
                      {slot.quantity}× {slot.label} ({slot.options?.length || 0} opc.)
                    </span>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: T.success }}>
                {combo.basePrice.toFixed(2)}€
              </div>

              {/* Serves */}
              <div style={{ fontSize: 13, color: T.muted }}>
                {combo.servesUpTo} pers.
              </div>

              {/* Slots count */}
              <div style={{ fontSize: 13, color: T.muted }}>
                {(combo.slots || []).length} slots
              </div>

              {/* Available toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleAvailable(combo) }}
                style={{ fontSize: 18, cursor: "pointer", border: "none", background: "none" }}
                title={combo.available ? "Desactivar" : "Activar"}
              >
                {combo.available ? "✅" : "⛔"}
              </button>

              {/* Popular toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); togglePopular(combo) }}
                style={{ fontSize: 18, cursor: "pointer", border: "none", background: "none" }}
                title={combo.popular ? "Quitar popular" : "Marcar popular"}
              >
                {combo.popular ? "⭐" : "☆"}
              </button>

              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteCombo(combo.id) }}
                style={{ fontSize: 14, cursor: "pointer", border: "none", background: "none", color: "#dc2626" }}
                title="Eliminar"
              >
                🗑
              </button>
            </div>
          ))
        )}
      </div>

      {/* ═══ Create / Edit Modal ═══ */}
      {creating && (
        <Overlay onClose={closeModal}>
          <div style={{ minWidth: 520, maxWidth: 680 }}>
            <h2 style={modalTitle}>{editing ? "Editar combo" : "Nuevo combo"}</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Basic info */}
              <div style={s.grid2}>
                <Fld label="Nombre (ES)">
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Mini Meeting Combo"
                    style={{ ...input, width: "100%" }}
                  />
                </Fld>
                <Fld label="Name (EN)">
                  <input
                    value={form.name_en || ""}
                    onChange={e => setForm({ ...form, name_en: e.target.value })}
                    placeholder="Mini Meeting Combo"
                    style={{ ...input, width: "100%" }}
                  />
                </Fld>
              </div>

              <div style={s.grid2}>
                <Fld label="Descripción (ES)">
                  <input
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Para equipos pequeños"
                    style={{ ...input, width: "100%" }}
                  />
                </Fld>
                <Fld label="Description (EN)">
                  <input
                    value={form.description_en || ""}
                    onChange={e => setForm({ ...form, description_en: e.target.value })}
                    placeholder="For small teams"
                    style={{ ...input, width: "100%" }}
                  />
                </Fld>
              </div>

              <div style={s.grid3}>
                <Fld label="Precio base (€)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.basePrice}
                    onChange={e => setForm({ ...form, basePrice: Number(e.target.value) })}
                    style={{ ...input, width: "100%" }}
                  />
                </Fld>
                <Fld label="Personas (hasta)">
                  <input
                    type="number"
                    value={form.servesUpTo}
                    onChange={e => setForm({ ...form, servesUpTo: Number(e.target.value) })}
                    style={{ ...input, width: "100%" }}
                  />
                </Fld>
                <Fld label="Orden">
                  <input
                    type="number"
                    value={form.order || 0}
                    onChange={e => setForm({ ...form, order: Number(e.target.value) })}
                    style={{ ...input, width: "100%" }}
                  />
                </Fld>
              </div>

              {/* Slots */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Slots (categorías del combo)
                  </label>
                  <button onClick={addSlot} style={{ ...btnSmall, fontSize: 12, padding: "5px 12px" }}>
                    + Slot
                  </button>
                </div>

                {form.slots.map((slot, si) => {
                  const suggestedProducts = getProductsForCategory(slot.category)
                  const allProducts = dbProducts
                  const selectedIds = new Set(slot.options.map(op => op.productId).filter(Boolean))

                  return (
                    <div key={si} style={s.slotBox}>
                      <div style={s.slotHeader}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>
                          Slot {si + 1}: {CATEGORY_LABELS[slot.category] || slot.category}
                        </span>
                        {form.slots.length > 1 && (
                          <button onClick={() => removeSlot(si)} style={s.removeBtn} title="Eliminar slot">✕</button>
                        )}
                      </div>

                      <div style={{ ...s.grid3, marginBottom: 12 }}>
                        <Fld label="Etiqueta (ES)">
                          <input
                            value={slot.label}
                            onChange={e => updateSlot(si, { label: e.target.value })}
                            placeholder="Bebida"
                            style={s.smallInput}
                          />
                        </Fld>
                        <Fld label="Label (EN)">
                          <input
                            value={slot.label_en || ""}
                            onChange={e => updateSlot(si, { label_en: e.target.value })}
                            placeholder="Drink"
                            style={s.smallInput}
                          />
                        </Fld>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Fld label="Categoría">
                            <select
                              value={slot.category}
                              onChange={e => updateSlot(si, { category: e.target.value as ComboSlot["category"] })}
                              style={{ ...s.smallInput, cursor: "pointer" }}
                            >
                              <option value="beverage">Bebida</option>
                              <option value="food">Comida</option>
                              <option value="snack">Snack</option>
                            </select>
                          </Fld>
                          <Fld label="Cant.">
                            <input
                              type="number"
                              min={1}
                              value={slot.quantity}
                              onChange={e => updateSlot(si, { quantity: Number(e.target.value) })}
                              style={{ ...s.smallInput, width: 60 }}
                            />
                          </Fld>
                        </div>
                      </div>

                      {/* Product selector */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Productos disponibles — clic para añadir/quitar ({slot.options.length} seleccionados)
                          </span>
                        </div>

                        {!productsLoaded ? (
                          <div style={{ fontSize: 12, color: T.dim, padding: 8 }}>Cargando productos...</div>
                        ) : (
                          <>
                            {/* Suggested products (matching category) */}
                            {suggestedProducts.length > 0 && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, color: T.info, fontWeight: 600, marginBottom: 6 }}>
                                  SUGERIDOS ({CATEGORY_LABELS[slot.category] || slot.category})
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {suggestedProducts.map(product => {
                                    const isSelected = selectedIds.has(product.id)
                                    return (
                                      <button
                                        key={product.id}
                                        onClick={() => toggleProductInSlot(si, product)}
                                        style={s.productChip(isSelected)}
                                      >
                                        {isSelected && <span>✓</span>}
                                        {product.name}
                                        <span style={{ fontFamily: T.mono, fontSize: 10, opacity: 0.6 }}>
                                          {product.price.toFixed(2)}€
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {/* All other products */}
                            {(() => {
                              const suggestedIds = new Set(suggestedProducts.map(p => p.id))
                              const others = allProducts.filter(p => !suggestedIds.has(p.id))
                              if (others.length === 0) return null

                              return (
                                <div>
                                  <div style={{ fontSize: 10, color: T.dim, fontWeight: 600, marginBottom: 6 }}>
                                    TODOS LOS PRODUCTOS
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 120, overflowY: "auto" }}>
                                    {others.map(product => {
                                      const isSelected = selectedIds.has(product.id)
                                      return (
                                        <button
                                          key={product.id}
                                          onClick={() => toggleProductInSlot(si, product)}
                                          style={s.productChip(isSelected)}
                                        >
                                          {isSelected && <span>✓</span>}
                                          {product.name}
                                          <span style={{ fontFamily: T.mono, fontSize: 10, opacity: 0.6 }}>
                                            {product.price.toFixed(2)}€
                                          </span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })()}
                          </>
                        )}

                        {/* Selected options with extra price editing */}
                        {slot.options.length > 0 && (
                          <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T.success, marginBottom: 6, textTransform: "uppercase" }}>
                              SELECCIONADOS ({slot.options.length})
                            </div>
                            {slot.options.map((opt, oi) => (
                              <div
                                key={oi}
                                style={{
                                  display: "grid", gridTemplateColumns: "1fr 90px 28px", gap: 8,
                                  alignItems: "center", marginBottom: 4,
                                }}
                              >
                                <span style={{ fontSize: 13, color: T.text }}>
                                  {opt.productId ? getProductName(opt.productId) : opt.name}
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 10, color: T.dim }}>+€</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={opt.extraPrice || 0}
                                    onChange={e => updateOptionExtraPrice(si, oi, Number(e.target.value))}
                                    style={{ ...s.smallInput, width: 60, padding: "4px 6px", fontSize: 12 }}
                                  />
                                </div>
                                <button onClick={() => removeOption(si, oi)} style={s.removeBtn} title="Quitar">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Checkboxes */}
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.available}
                    onChange={e => setForm({ ...form, available: e.target.checked })}
                  />
                  Disponible
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.popular || false}
                    onChange={e => setForm({ ...form, popular: e.target.checked })}
                  />
                  Popular
                </label>
              </div>

              {/* Save button */}
              <button
                onClick={saveCombo}
                disabled={saving || !form.name.trim()}
                style={{
                  ...btnPrimary,
                  width: "100%",
                  justifyContent: "center",
                  opacity: saving || !form.name.trim() ? 0.5 : 1,
                }}
              >
                {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear combo"}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}
