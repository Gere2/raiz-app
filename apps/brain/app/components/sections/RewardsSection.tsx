"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../../lib/authed-fetch"
import { T, page, pageTitle, pageSub, tableWrap, tableHead, tableRow, btnSmall } from "../theme"

type Reward = {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  pointsCost: number
  emoji: string
  category: string
  enabled: boolean
  sortOrder?: number
}

interface RewardsSectionProps {
  user: User
  orgId: string
}

export default function RewardsSection({ user, orgId }: RewardsSectionProps) {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [newReward, setNewReward] = useState({ name: "", nameEn: "", description: "", descriptionEn: "", pointsCost: 500, emoji: "🎁", category: "drinks" })

  const fetchRewards = useCallback(async () => {
    setLoading(true)
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/rewards`)
      const d = await r.json()
      setRewards(d.rewards || [])
    } catch (e) {
      console.error("Error fetching rewards:", e)
    }
    setLoading(false)
  }, [user, orgId])

  useEffect(() => { fetchRewards() }, [fetchRewards])

  const seedRewards = async () => {
    setSaving(true)
    try {
      await authedFetch(user, `/api/org/${orgId}/rewards/seed`, { method: "POST" })
      await fetchRewards()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await authedFetch(user, `/api/org/${orgId}/rewards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      })
      setRewards(prev => prev.map(r => r.id === id ? { ...r, enabled: !enabled } : r))
    } catch (e) { console.error(e) }
  }

  const updatePrice = async (id: string) => {
    setSaving(true)
    try {
      await authedFetch(user, `/api/org/${orgId}/rewards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pointsCost: editPrice }),
      })
      setRewards(prev => prev.map(r => r.id === id ? { ...r, pointsCost: editPrice } : r))
      setEditingId(null)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const createReward = async () => {
    setSaving(true)
    try {
      await authedFetch(user, `/api/org/${orgId}/rewards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newReward, enabled: true }),
      })
      await fetchRewards()
      setShowNew(false)
      setNewReward({ name: "", nameEn: "", description: "", descriptionEn: "", pointsCost: 500, emoji: "🎁", category: "drinks" })
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const deleteReward = async (id: string) => {
    if (!confirm("¿Eliminar esta recompensa?")) return
    try {
      await authedFetch(user, `/api/org/${orgId}/rewards/${id}`, { method: "DELETE" })
      setRewards(prev => prev.filter(r => r.id !== id))
    } catch (e) { console.error(e) }
  }

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h1 style={pageTitle}>Recompensas</h1>
          <p style={pageSub}>Gestiona el catálogo de rewards del programa de fidelización</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={seedRewards} disabled={saving} style={{ ...btnSmall, color: "#16a34a", borderColor: "#16a34a40" }}>
            {saving ? "..." : "🌱 Reseedear catálogo"}
          </button>
          <button onClick={() => setShowNew(!showNew)} style={{ ...btnSmall, color: T.accent, borderColor: T.accent + "40" }}>
            + Nueva recompensa
          </button>
        </div>
      </div>

      {/* New reward form */}
      {showNew && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input placeholder="Nombre (ES)" value={newReward.name} onChange={e => setNewReward({ ...newReward, name: e.target.value })} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }} />
            <input placeholder="Name (EN)" value={newReward.nameEn} onChange={e => setNewReward({ ...newReward, nameEn: e.target.value })} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }} />
            <input placeholder="Descripción" value={newReward.description} onChange={e => setNewReward({ ...newReward, description: e.target.value })} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }} />
            <input placeholder="Coste en granos" type="number" value={newReward.pointsCost} onChange={e => setNewReward({ ...newReward, pointsCost: Number(e.target.value) })} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }} />
            <input placeholder="Emoji" value={newReward.emoji} onChange={e => setNewReward({ ...newReward, emoji: e.target.value })} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, maxWidth: 80 }} />
            <select value={newReward.category} onChange={e => setNewReward({ ...newReward, category: e.target.value })} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}>
              <option value="drinks">Bebidas</option>
              <option value="food">Comida</option>
              <option value="merch">Merch</option>
              <option value="experience">Experiencia</option>
            </select>
          </div>
          <button onClick={createReward} disabled={saving || !newReward.name} style={{ ...btnSmall, color: "#fff", background: T.accent, borderColor: T.accent }}>
            {saving ? "Guardando..." : "Crear recompensa"}
          </button>
        </div>
      )}

      {/* Rewards table */}
      <div style={tableWrap}>
        <div style={tableHead}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Catálogo de recompensas ({rewards.length})</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: T.dim }}>Cargando...</div>
        ) : (
          rewards.map(r => (
            <div key={r.id} style={{ ...tableRow, display: "grid", gridTemplateColumns: "40px 2fr 100px 100px 60px 40px", alignItems: "center", opacity: r.enabled ? 1 : 0.5 }}>
              <span style={{ fontSize: 20 }}>{r.emoji}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: T.dim }}>{r.description}</div>
              </div>
              <div>
                {editingId === r.id ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <input type="number" value={editPrice} onChange={e => setEditPrice(Number(e.target.value))} style={{ width: 60, padding: 4, border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12 }} />
                    <button onClick={() => updatePrice(r.id)} style={{ fontSize: 11, cursor: "pointer", color: "#16a34a" }}>✓</button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 11, cursor: "pointer", color: T.dim }}>✕</button>
                  </div>
                ) : (
                  <span
                    onClick={() => { setEditingId(r.id); setEditPrice(r.pointsCost) }}
                    style={{ fontFamily: "monospace", fontSize: 13, cursor: "pointer", color: T.accent }}
                    title="Clic para editar"
                  >
                    ☕ {r.pointsCost}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: T.dim, textTransform: "capitalize" }}>{r.category}</span>
              <button onClick={() => toggleEnabled(r.id, r.enabled)} style={{ fontSize: 18, cursor: "pointer", border: "none", background: "none" }} title={r.enabled ? "Desactivar" : "Activar"}>
                {r.enabled ? "✅" : "⛔"}
              </button>
              <button onClick={() => deleteReward(r.id)} style={{ fontSize: 14, cursor: "pointer", border: "none", background: "none", color: "#dc2626" }} title="Eliminar">
                🗑
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
