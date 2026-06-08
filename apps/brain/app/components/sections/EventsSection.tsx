"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../../lib/authed-fetch"
import { T, page, pageTitle, pageSub } from "../theme"

type SystemEvent = {
  id: string
  type: string
  source: string
  data: Record<string, unknown>
  actorId?: string
  actorName?: string
  timestamp: string
}

interface EventsSectionProps {
  user: User
  orgId: string
}

const EVENT_ICONS: Record<string, string> = {
  "order.created": "📋",
  "order.paid": "💳",
  "order.status_changed": "🔄",
  "order.ready": "🔔",
  "order.picked_up": "✅",
  "order.canceled": "❌",
  "loyalty.points_earned": "☕",
  "loyalty.points_redeemed": "🎁",
  "loyalty.level_up": "⬆️",
  "gamification.badge_unlocked": "🏅",
  "gamification.mission_completed": "🎯",
  "gamification.quiz_completed": "🧠",
  "catalog.availability_changed": "📦",
  "pricing.price_changed": "💰",
  "inventory.stock_low": "⚠️",
  "inventory.stock_depleted": "🔴",
  "recipe.cost_changed": "📊",
  "ingredient.cost_updated": "🏷️",
  "customer.segment_changed": "👤",
  "customer.churning_detected": "🚨",
  "shift.closed": "🔒",
  "waste.logged": "🗑",
  "rewards.catalog_updated": "✨",
}

const SOURCE_COLORS: Record<string, string> = {
  APP: "#6366f1",
  POS: "#16a34a",
  BRAIN: "#f59e0b",
  SYSTEM: "#6b7280",
}

const EVENT_TYPE_GROUPS = [
  { label: "Todos", value: "" },
  { label: "Pedidos", value: "order." },
  { label: "Loyalty", value: "loyalty." },
  { label: "Pricing", value: "pricing." },
  { label: "Inventario", value: "inventory." },
  { label: "Clientes", value: "customer." },
]

export default function EventsSection({ user, orgId }: EventsSectionProps) {
  const [events, setEvents] = useState<SystemEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState("")

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "50" })
      if (typeFilter) {
        // Filter by prefix — just get all and filter client-side for simplicity
      }
      const r = await authedFetch(user, `/api/org/${orgId}/events?${params}`)
      const d = await r.json()
      let evts = d.events || []
      if (typeFilter) {
        evts = evts.filter((e: SystemEvent) => e.type.startsWith(typeFilter))
      }
      setEvents(evts)
    } catch (e) {
      console.error("Error fetching events:", e)
    }
    setLoading(false)
  }, [user, orgId, typeFilter])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts)
      const now = new Date()
      const diff = (now.getTime() - d.getTime()) / 1000

      if (diff < 60) return "ahora"
      if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
      if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
      return d.toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    } catch { return ts }
  }

  const formatEventData = (event: SystemEvent): string => {
    const d = event.data
    switch (event.type) {
      case "pricing.price_changed":
        return `${d.skuName}: ${d.oldPrice}€ → ${d.newPrice}€`
      case "recipe.cost_changed":
        return `${d.recipeName}: food cost ${Number(d.oldFoodCostPct || 0).toFixed(1)}% → ${Number(d.newFoodCostPct || 0).toFixed(1)}%`
      case "ingredient.cost_updated":
        return `${d.itemName}: ${Number(d.oldCost || 0).toFixed(4)}€ → ${Number(d.newCost || 0).toFixed(4)}€`
      case "loyalty.points_earned":
        return `+${d.points} granos (${d.source})`
      case "customer.segment_changed":
        return `${d.customerName || d.customerId}: ${d.oldSegment} → ${d.newSegment}`
      default:
        return Object.entries(d).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ")
    }
  }

  return (
    <div style={page}>
      <h1 style={pageTitle}>Eventos</h1>
      <p style={pageSub}>Timeline de actividad del ecosistema</p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {EVENT_TYPE_GROUPS.map(g => (
          <button
            key={g.value}
            onClick={() => setTypeFilter(g.value)}
            style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12,
              border: `1px solid ${typeFilter === g.value ? T.accent : "#e5e7eb"}`,
              background: typeFilter === g.value ? T.accent10 : "#fff",
              color: typeFilter === g.value ? T.accent : T.dim,
              cursor: "pointer",
            }}
          >
            {g.label}
          </button>
        ))}
        <button onClick={fetchEvents} style={{ ...{ padding: "6px 14px", borderRadius: 6, fontSize: 12, border: "1px solid #e5e7eb", background: T.surface, color: T.dim, cursor: "pointer" } }}>
          🔄 Refrescar
        </button>
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: T.dim }}>Cargando eventos...</div>
      ) : events.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: T.dim }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div>No hay eventos registrados todavía</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Los eventos aparecerán cuando se realicen acciones en el ecosistema</div>
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 24 }}>
          {/* Timeline line */}
          <div style={{ position: "absolute", left: 11, top: 0, bottom: 0, width: 2, background: "#e5e7eb" }} />

          {events.map(event => (
            <div key={event.id} style={{ position: "relative", marginBottom: 12, paddingLeft: 20 }}>
              {/* Dot */}
              <div style={{
                position: "absolute", left: -6, top: 8, width: 12, height: 12,
                borderRadius: "50%", border: "2px solid #fff",
                background: SOURCE_COLORS[event.source] || "#6b7280",
              }} />

              <div style={{
                background: T.surface, border: "1px solid #f3f4f6", borderRadius: 8,
                padding: "10px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{EVENT_ICONS[event.type] || "📌"}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{event.type}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 10,
                      background: (SOURCE_COLORS[event.source] || "#6b7280") + "15",
                      color: SOURCE_COLORS[event.source] || "#6b7280",
                      fontWeight: 600,
                    }}>
                      {event.source}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: T.dim }}>{formatTime(event.timestamp)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#374151" }}>{formatEventData(event)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
