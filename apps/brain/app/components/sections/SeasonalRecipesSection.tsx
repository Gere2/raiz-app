"use client";

import { useState, useEffect, useCallback } from "react";
import { Kpi } from "../ui";
import {
  T, page, pageTitle, pageSub, tableWrap, tableHead,
  btnSmall, btnPrimary, badge, fmt,
} from "../theme";
import type { User } from "firebase/auth";

/* ─── Types ── */
type SeasonalSuggestion = {
  id: string;
  name: string;
  description: string;
  reason: string;
  season: string;
  tags: string[];
  estimatedFoodCost: number;
  estimatedMargin: number;
  ingredients: Array<{ name: string; available: boolean; inCatalog: boolean }>;
  difficulty: "easy" | "medium" | "hard";
  prepTimeMins: number;
  matchScore: number;
  weatherFit: boolean;
  academicFit: boolean;
  trendingInArea: boolean;
};

type SeasonalContext = {
  currentSeason: string;
  temperature: number;
  weatherCondition: string;
  academicPeriod: string;
  isExamWeek: boolean;
  campusActivity: string;
  dayOfWeek: string;
  suggestions: SeasonalSuggestion[];
  trendInsights: string[];
};

interface SeasonalProps {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
}

const seasonEmoji: Record<string, string> = { winter: "❄️", spring: "🌸", summer: "☀️", autumn: "🍂", invierno: "❄️", primavera: "🌸", verano: "☀️", otoño: "🍂" };
const difficultyLabel: Record<string, string> = { easy: "Fácil", medium: "Media", hard: "Difícil" };
const difficultyColor: Record<string, string> = { easy: "#16a34a", medium: "#ca8a04", hard: "#dc2626" };

export default function SeasonalRecipesSection({ user, orgId, authedFetch }: SeasonalProps) {
  const [data, setData] = useState<SeasonalContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTag, setFilterTag] = useState("all");
  const [creating, setCreating] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/seasonal-suggestions`);
      if (r.ok) { const d = await r.json(); setData(d); }
    } catch (e) { console.error("Seasonal fetch:", e); }
    finally { setLoading(false); }
  }, [user, orgId, authedFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createRecipeFromSuggestion = async (suggestion: SeasonalSuggestion) => {
    setCreating(suggestion.id);
    try {
      await authedFetch(user, `/api/org/${orgId}/seasonal-suggestions/create-recipe`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: suggestion.id, name: suggestion.name }),
      });
      await fetchData();
    } finally { setCreating(null); }
  };

  if (loading && !data) return <div style={{ ...page, textAlign: "center", paddingTop: 80, color: T.dim }}>Analizando temporada y contexto...</div>;
  if (!data) return <div style={{ ...page, textAlign: "center", paddingTop: 80, color: T.dim }}>Sin datos disponibles.</div>;

  const allTags = [...new Set(data.suggestions.flatMap(s => s.tags))];
  const filtered = data.suggestions.filter(s => filterTag === "all" || s.tags.includes(filterTag));

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={pageTitle}>Propuestas de temporada</h1>
          <p style={pageSub}>Recetas sugeridas según estación, clima y calendario académico</p>
        </div>
        <button onClick={fetchData} disabled={loading} style={{ ...btnSmall, color: T.accent, borderColor: T.accent40 }}>
          {loading ? "..." : "↻ Actualizar"}
        </button>
      </div>

      {/* ── Context banner ── */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 24, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Estación</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{seasonEmoji[data.currentSeason] || "🌍"} {data.currentSeason}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Clima</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{data.temperature}°C · {data.weatherCondition}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Período académico</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {data.academicPeriod}
            {data.isExamWeek && <span style={{ ...badge, marginLeft: 8, color: "#dc2626", background: T.dangerBg }}>Exámenes</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Actividad campus</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{data.campusActivity}</div>
        </div>
      </div>

      {/* ── Trend insights ── */}
      {data.trendInsights.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {data.trendInsights.map((insight, i) => (
            <div key={i} style={{ padding: "8px 14px", marginBottom: 6, borderRadius: 8, fontSize: 12, background: "#f0f9ff", color: "#1e40af", border: "1px solid #bfdbfe" }}>
              💡 {insight}
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => setFilterTag("all")} style={{ ...btnSmall, ...(filterTag === "all" ? { background: T.accent14, color: T.accent, borderColor: T.accent } : {}) }}>
          Todas ({data.suggestions.length})
        </button>
        {allTags.map(tag => (
          <button key={tag} onClick={() => setFilterTag(tag)} style={{ ...btnSmall, ...(filterTag === tag ? { background: T.accent14, color: T.accent, borderColor: T.accent } : {}) }}>
            {tag} ({data.suggestions.filter(s => s.tags.includes(tag)).length})
          </button>
        ))}
      </div>

      {/* ── Suggestion cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {filtered.map(s => (
          <div key={s.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, position: "relative" }}>
            {/* Match score indicator */}
            <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border, overflow: "hidden" }}>
                <div style={{ width: `${s.matchScore}%`, height: "100%", background: s.matchScore >= 80 ? "#16a34a" : s.matchScore >= 60 ? "#ca8a04" : T.dim, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 10, color: T.dim }}>{s.matchScore}%</span>
            </div>

            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6, paddingRight: 60 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 12 }}>{s.description}</div>

            {/* Tags */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {s.weatherFit && <span style={{ ...badge, fontSize: 10, color: "#2563eb", background: T.infoBg }}>🌤 Clima</span>}
              {s.academicFit && <span style={{ ...badge, fontSize: 10, color: "#7c3aed", background: "#f5f3ff" }}>🎓 Académico</span>}
              {s.trendingInArea && <span style={{ ...badge, fontSize: 10, color: "#059669", background: "#ecfdf5" }}>📈 Tendencia</span>}
              <span style={{ ...badge, fontSize: 10, color: difficultyColor[s.difficulty], background: difficultyColor[s.difficulty] + "14" }}>
                {difficultyLabel[s.difficulty]}
              </span>
              <span style={{ ...badge, fontSize: 10, color: T.dim, background: T.bg }}>{s.prepTimeMins} min</span>
            </div>

            {/* Reason */}
            <div style={{ fontSize: 11, color: T.accent, fontWeight: 500, marginBottom: 12, padding: "6px 10px", background: T.accent08, borderRadius: 6 }}>
              {s.reason}
            </div>

            {/* Estimated metrics */}
            <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12 }}>
              <div>
                <span style={{ color: T.dim }}>Food cost est. </span>
                <span style={{ fontWeight: 600, fontFamily: T.mono, color: s.estimatedFoodCost <= 25 ? "#16a34a" : s.estimatedFoodCost <= 35 ? "#ca8a04" : "#dc2626" }}>{fmt(s.estimatedFoodCost)}%</span>
              </div>
              <div>
                <span style={{ color: T.dim }}>Margen est. </span>
                <span style={{ fontWeight: 600, fontFamily: T.mono, color: "#16a34a" }}>{fmt(s.estimatedMargin)}€</span>
              </div>
            </div>

            {/* Ingredients availability */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Ingredientes</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {s.ingredients.map((ing, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4,
                    background: ing.inCatalog ? T.successBg : T.warningBg,
                    color: ing.inCatalog ? "#16a34a" : "#854d0e",
                    border: `1px solid ${ing.inCatalog ? "#bbf7d0" : "#fde68a"}`,
                  }}>
                    {ing.inCatalog ? "✓" : "?"} {ing.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Action */}
            <button
              onClick={() => createRecipeFromSuggestion(s)}
              disabled={creating === s.id}
              style={{ ...btnPrimary, width: "100%", justifyContent: "center" }}
            >
              {creating === s.id ? "Creando..." : "Crear receta"}
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.dim }}>
          No hay sugerencias para los filtros seleccionados.
        </div>
      )}
    </div>
  );
}
