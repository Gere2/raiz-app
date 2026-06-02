"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"

interface MissionCriterion {
  type: string
  target: number
}

interface Mission {
  id: string
  title: string
  titleEn: string
  emoji: string
  category: string
  reward: number
  badgeId?: string
  criteria: MissionCriterion[]
  expiresInDays?: number
  priority: number
  requiresMissionId?: string
  enabled: boolean
  academicPeriod?: string
}

const CATEGORY_COLORS: Record<string, string> = {
  onboarding: "bg-green-100 text-green-700",
  weekly: "bg-blue-100 text-blue-700",
  discovery: "bg-purple-100 text-purple-700",
  recurrence: "bg-amber-100 text-amber-700",
  product: "bg-pink-100 text-pink-700",
  operational: "bg-cyan-100 text-cyan-700",
  seasonal: "bg-red-100 text-red-700",
}

const CRITERION_LABELS: Record<string, string> = {
  purchase_count: "Compras",
  quiz_complete: "Quizzes completados",
  unique_products: "Productos únicos",
  order_ahead: "Pedidos por app",
  reusable_cup: "Vaso reutilizable",
  streak_days: "Semanas de racha",
  spend_amount: "Gasto (€)",
  badge_earned: "Badge desbloqueado",
  profile_complete: "Perfil completo",
  first_purchase: "Primera compra",
  invite_friend: "Invitar amigo",
}

export default function MissionsSection({ user, orgId, authedFetch }: {
  user: User
  orgId: string
  authedFetch: (user: User, path: string, init?: RequestInit) => Promise<Response>
}) {
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newMission, setNewMission] = useState({
    title: "",
    titleEn: "",
    emoji: "🎯",
    category: "weekly",
    reward: 100,
    priority: 50,
    criterionType: "purchase_count",
    criterionTarget: 1,
  })

  const fetchMissions = useCallback(async () => {
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/missions`)
      const data = await res.json()
      setMissions(data.missions || [])
    } catch (err) {
      console.error("Error fetching missions:", err)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { fetchMissions() }, [fetchMissions])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await authedFetch(user, `/api/org/${orgId}/missions/seed`, { method: "POST" })
      await fetchMissions()
    } finally {
      setSeeding(false)
    }
  }

  const toggleEnabled = async (mission: Mission) => {
    try {
      await authedFetch(user, `/api/org/${orgId}/missions/${mission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !mission.enabled }),
      })
      setMissions(prev => prev.map(m =>
        m.id === mission.id ? { ...m, enabled: !m.enabled } : m
      ))
    } catch (err) {
      console.error("Error toggling mission:", err)
    }
  }

  const updateReward = async (mission: Mission, reward: number) => {
    try {
      await authedFetch(user, `/api/org/${orgId}/missions/${mission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward }),
      })
      setMissions(prev => prev.map(m =>
        m.id === mission.id ? { ...m, reward } : m
      ))
    } catch (err) {
      console.error("Error updating reward:", err)
    }
  }

  const handleCreate = async () => {
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newMission.title,
          titleEn: newMission.titleEn || newMission.title,
          emoji: newMission.emoji,
          category: newMission.category,
          reward: newMission.reward,
          priority: newMission.priority,
          criteria: [{ type: newMission.criterionType, target: newMission.criterionTarget }],
          enabled: true,
        }),
      })
      if (res.ok) {
        setShowCreate(false)
        setNewMission({ title: "", titleEn: "", emoji: "🎯", category: "weekly", reward: 100, priority: 50, criterionType: "purchase_count", criterionTarget: 1 })
        await fetchMissions()
      }
    } catch (err) {
      console.error("Error creating mission:", err)
    }
  }

  const deleteMission = async (mission: Mission) => {
    if (!confirm(`¿Eliminar misión "${mission.title}"?`)) return
    try {
      await authedFetch(user, `/api/org/${orgId}/missions/${mission.id}`, { method: "DELETE" })
      setMissions(prev => prev.filter(m => m.id !== mission.id))
    } catch (err) {
      console.error("Error deleting mission:", err)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Cargando misiones...</div>
  }

  // Group by category
  const byCategory: Record<string, Mission[]> = {}
  for (const m of missions) {
    const cat = m.category || "otro"
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(m)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Misiones</h2>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona las misiones de gamificación · {missions.length} misiones
          </p>
        </div>
        <div className="flex gap-2">
          {missions.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {seeding ? "Sembrando..." : "Sembrar por defecto"}
            </button>
          )}
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900"
          >
            + Nueva misión
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border rounded-xl p-5 bg-gray-50 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Nueva misión</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Título (ES)"
              value={newMission.title}
              onChange={e => setNewMission(p => ({ ...p, title: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Título (EN)"
              value={newMission.titleEn}
              onChange={e => setNewMission(p => ({ ...p, titleEn: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Emoji"
              value={newMission.emoji}
              onChange={e => setNewMission(p => ({ ...p, emoji: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm w-20"
            />
            <select
              value={newMission.category}
              onChange={e => setNewMission(p => ({ ...p, category: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              {Object.keys(CATEGORY_COLORS).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Recompensa:</label>
              <input
                type="number"
                value={newMission.reward}
                onChange={e => setNewMission(p => ({ ...p, reward: parseInt(e.target.value) || 0 }))}
                className="border rounded-lg px-3 py-2 text-sm w-24"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Prioridad:</label>
              <input
                type="number"
                value={newMission.priority}
                onChange={e => setNewMission(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                className="border rounded-lg px-3 py-2 text-sm w-24"
              />
            </div>
            <select
              value={newMission.criterionType}
              onChange={e => setNewMission(p => ({ ...p, criterionType: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              {Object.entries(CRITERION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Objetivo:</label>
              <input
                type="number"
                value={newMission.criterionTarget}
                onChange={e => setNewMission(p => ({ ...p, criterionTarget: parseInt(e.target.value) || 1 }))}
                className="border rounded-lg px-3 py-2 text-sm w-24"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newMission.title} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
              Crear
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-300">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {missions.length === 0 && !seeding && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <p className="text-3xl mb-2">🎯</p>
          <p className="text-sm text-gray-500">No hay misiones todavía</p>
          <p className="text-xs text-gray-400 mt-1">Siembra las misiones por defecto o crea una nueva</p>
        </div>
      )}

      {Object.entries(byCategory).map(([category, categoryMissions]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${CATEGORY_COLORS[category] || "bg-gray-100 text-gray-500"}`}>
              {category}
            </span>
            <span className="text-xs text-gray-400">{categoryMissions.length} misiones</span>
          </h3>
          <div className="space-y-2">
            {categoryMissions.map(mission => (
              <div
                key={mission.id}
                className={`border rounded-lg p-4 flex items-center gap-4 transition-opacity ${
                  mission.enabled ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"
                }`}
              >
                <span className="text-2xl">{mission.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{mission.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {mission.criteria.map((c, i) => (
                      <span key={i} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {CRITERION_LABELS[c.type] || c.type}: {c.target}
                      </span>
                    ))}
                    {mission.badgeId && (
                      <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                        Badge: {mission.badgeId}
                      </span>
                    )}
                    {mission.requiresMissionId && (
                      <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">
                        Requiere: {mission.requiresMissionId}
                      </span>
                    )}
                    {mission.expiresInDays && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                        Expira: {mission.expiresInDays}d
                      </span>
                    )}
                  </div>
                </div>

                {/* Reward editor */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={mission.reward}
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v)) setMissions(prev => prev.map(m => m.id === mission.id ? { ...m, reward: v } : m))
                    }}
                    onBlur={e => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v) && v !== mission.reward) updateReward(mission, v)
                    }}
                    className="w-16 text-sm text-right border rounded px-2 py-1"
                  />
                  <span className="text-xs text-gray-400">pts</span>
                </div>

                {/* Enable/disable */}
                <button
                  onClick={() => toggleEnabled(mission)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    mission.enabled
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                  }`}
                >
                  {mission.enabled ? "Activa" : "Inactiva"}
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteMission(mission)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
