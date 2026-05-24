"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../../lib/authed-fetch"
import { T, page, pageTitle, pageSub, tableWrap, tableHead, tableRow, badge, btnSmall, input } from "../theme"

interface Quiz {
  id: string
  title: string
  titleEn: string
  emoji: string
  moduleId: string
  cadence: string
  points: number
  enabled: boolean
  sortOrder: number
  questions: { question: string }[]
}

const MODULE_LABELS: Record<string, string> = {
  bienvenida: "Bienvenida",
  "cafe-actual": "Café actual",
  semanal: "Semanal",
}

const CADENCE_LABELS: Record<string, string> = {
  once: "Una vez",
  monthly: "Mensual",
  weekly: "Semanal",
}

const CADENCE_COLORS: Record<string, { bg: string; color: string }> = {
  once:    { bg: "#f3e8ff", color: "#7c3aed" },
  monthly: { bg: "#dbeafe", color: "#1d4ed8" },
  weekly:  { bg: "#fef3c7", color: "#b45309" },
}

export default function QuizzesSection({ user, orgId }: { user: User; orgId: string }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const fetchQuizzes = useCallback(async () => {
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/quizzes`)
      const data = await res.json()
      setQuizzes(data.quizzes || [])
    } catch (err) {
      console.error("Error fetching quizzes:", err)
    } finally {
      setLoading(false)
    }
  }, [user, orgId])

  useEffect(() => { fetchQuizzes() }, [fetchQuizzes])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await authedFetch(user, `/api/org/${orgId}/quizzes/seed`, { method: "POST" })
      await fetchQuizzes()
    } finally {
      setSeeding(false)
    }
  }

  const toggleEnabled = async (quiz: Quiz) => {
    try {
      await authedFetch(user, `/api/org/${orgId}/quizzes/${quiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !quiz.enabled }),
      })
      setQuizzes(prev => prev.map(q => q.id === quiz.id ? { ...q, enabled: !q.enabled } : q))
    } catch (err) {
      console.error("Error toggling quiz:", err)
    }
  }

  const updatePoints = async (quiz: Quiz, points: number) => {
    setSavingId(quiz.id)
    try {
      await authedFetch(user, `/api/org/${orgId}/quizzes/${quiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      })
      setQuizzes(prev => prev.map(q => q.id === quiz.id ? { ...q, points } : q))
    } catch (err) {
      console.error("Error updating points:", err)
    } finally {
      setSavingId(null)
    }
  }

  // Group by module
  const byModule: Record<string, Quiz[]> = {}
  for (const q of quizzes) {
    const mod = q.moduleId || "otro"
    if (!byModule[mod]) byModule[mod] = []
    byModule[mod].push(q)
  }

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <h1 style={pageTitle}>Quizzes</h1>
          <p style={pageSub}>Gestiona los quizzes de la app · {quizzes.length} quizzes</p>
        </div>
        {quizzes.length === 0 && (
          <button onClick={handleSeed} disabled={seeding} style={{ ...btnSmall, color: "#16a34a", borderColor: "#16a34a40" }}>
            {seeding ? "Sembrando..." : "🌱 Sembrar por defecto"}
          </button>
        )}
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: T.dim }}>Cargando quizzes...</div>
      )}

      {!loading && quizzes.length === 0 && (
        <div style={{ padding: 48, textAlign: "center", background: T.surface, border: `1px dashed ${T.border}`, borderRadius: 12 }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>🧠</p>
          <p style={{ fontSize: 14, color: T.muted }}>No hay quizzes todavía</p>
          <p style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>Usa el botón para crear los quizzes por defecto</p>
        </div>
      )}

      {!loading && Object.entries(byModule).map(([moduleId, moduleQuizzes]) => (
        <div key={moduleId} style={{ marginBottom: 24 }}>
          {/* Module header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ ...badge, background: T.bg, color: T.muted, border: `1px solid ${T.border}` }}>
              {MODULE_LABELS[moduleId] || moduleId}
            </span>
            <span style={{ fontSize: 12, color: T.dim }}>{moduleQuizzes.length} quizzes</span>
          </div>

          <div style={tableWrap}>
            {moduleQuizzes.map((quiz, i) => (
              <div
                key={quiz.id}
                style={{
                  ...tableRow,
                  display: "grid",
                  gridTemplateColumns: "36px 1fr auto auto auto",
                  gap: 12,
                  alignItems: "center",
                  opacity: quiz.enabled ? 1 : 0.5,
                  borderBottom: i < moduleQuizzes.length - 1 ? `1px solid ${T.border}` : "none",
                }}
              >
                {/* Emoji */}
                <span style={{ fontSize: 22 }}>{quiz.emoji}</span>

                {/* Title + meta */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{quiz.title}</span>
                    <span style={{
                      ...badge,
                      background: CADENCE_COLORS[quiz.cadence]?.bg ?? T.bg,
                      color: CADENCE_COLORS[quiz.cadence]?.color ?? T.dim,
                    }}>
                      {CADENCE_LABELS[quiz.cadence] || quiz.cadence}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: T.dim }}>
                    {quiz.questions?.length || 0} preguntas · {quiz.id}
                  </span>
                </div>

                {/* Points editor */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    value={quiz.points}
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v)) setQuizzes(prev => prev.map(q => q.id === quiz.id ? { ...q, points: v } : q))
                    }}
                    onBlur={e => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v)) updatePoints(quiz, v)
                    }}
                    style={{ ...input, width: 64, textAlign: "right", padding: "5px 8px", fontSize: 13 }}
                  />
                  <span style={{ fontSize: 11, color: T.dim, whiteSpace: "nowrap" }}>
                    {savingId === quiz.id ? "✓" : "pts"}
                  </span>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleEnabled(quiz)}
                  style={{
                    ...btnSmall,
                    color: quiz.enabled ? "#16a34a" : T.dim,
                    borderColor: quiz.enabled ? "#16a34a40" : T.border,
                    background: quiz.enabled ? "#f0fdf4" : T.bg,
                  }}
                >
                  {quiz.enabled ? "Activo" : "Inactivo"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
