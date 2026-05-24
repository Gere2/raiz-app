"use client";

/**
 * PanelDeVerdad.tsx (PR7)
 *
 * UI mínima viable del Panel de Verdad. Compone los endpoints existentes:
 *   - GET  /api/org/[orgId]/treasury/monthly?from=…&to=…  (PR3)
 *   - GET  /api/org/[orgId]/treasury/scenarios?month=…    (PR5)
 *   - POST /api/org/[orgId]/treasury/monthly-summary      (PR8)
 *
 * Layout:
 *   1. Selector de rango (mes inicial / final)
 *   2. KPI hero del mes seleccionado: semáforo + ventas TPV + caja + económico
 *   3. Card resumen CFO/CEO (carga del summary, botón "regenerar")
 *   4. Tabla escenarios sueldo Geremi (5 columnas: 0/500/1k/1.5k/2k)
 *   5. Tabla mensual con todas las líneas + food cost + estado
 *   6. Lista warnings agrupados por mes (collapsible)
 *
 * No se hace edición desde aquí — eso vive en pestañas anteriores y en CLI.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { authedFetch } from "../../../../lib/authed-fetch";
import { T, fmt } from "../../theme";

/* ─── Tipos resumidos del payload del aggregator ───────────── */

type Bucket = { total: number; count: number; sourceIds?: string[] };
type Snapshot = {
  monthId: string;
  totalMovements: number;
  cash: {
    ventasTpv: Bucket;
    ingresosOtros: Bucket;
    costeProductoPagado: Bucket;
    suministros: Bucket;
    tecnologia: Bucket;
    gestoria: Bucket;
    transporte: Bucket;
    personalPagado: Bucket;
    otrosGastos: Bucket;
    impuestosAEAT: Bucket;
    seguridadSocial: Bucket;
    tarjetaPendiente: Bucket;
    disposicionSocio: Bucket;
    traspasosInternos: Bucket;
    sinClasificar: Bucket;
    ingresosTotales: number;
    gastosOperativosTotales: number;
    resultadoOperativoCaja: number;
    resultadoCaja: number;
    pctSinClasificar: number;
  };
  economic: {
    ingresosTotales: number;
    resultadoOperativoAntesImpuestos: number;
    resultadoEconomicoAntesSueldoFundador: number;
    resultadoEconomicoConSueldoFundador: number;
    sueldoFundadorImputado: number;
    accrualsAplicados: { count: number; total: number };
  };
  foodCost: {
    foodCostPagadoPct: number;
    target: number;
    alerta: number;
    estado: "verde" | "amarillo" | "rojo" | "sin_datos";
  };
  semaforo?: {
    estado: "verde" | "amarillo" | "rojo";
    reason: string;
    salaryUsed: number;
    cashWithSalary: number;
    economicWithSalary: number;
  };
  possibleSalary?: {
    sueldoMaximoCaja: number;
    sueldoMaximoEconomico: number;
    sueldoMaximo: number;
    sueldoRecomendadoPrudente: number;
    sueldoObjetivo: number;
    gap: number;
    ventasExtraMesEur: number;
    ticketsExtraMes: number;
    ticketsExtraDia: number;
    inputs: { avgTicket: number; operatingDaysPerMonth: number; grossMarginRatio: number };
  };
  scenarios?: Array<{
    salary: number;
    cashWithSalary: number;
    economicWithSalary: number;
    semaforo: "verde" | "amarillo" | "rojo";
    reason: string;
  }>;
  warnings: Array<{
    code: string;
    severity: "info" | "warn" | "danger";
    message: string;
  }>;
  assumptionsApplied: { foundersSalary: number; foundersSalaryTarget?: number };
};

type CFOSummary = {
  monthId: string;
  generatedAt: string;
  model: string;
  blocks: {
    quePaso: string;
    porquePaso: string;
    queBien: string;
    quePreocupa: string;
    queDecision: string;
    sueldoGeremi: string;
    queFaltaVerde: string;
  };
};

const SEM_COLORS: Record<string, string> = {
  verde: "#16a34a",
  amarillo: "#ca8a04",
  rojo: "#b91c1c",
  sin_datos: "#94a3b8",
};

const SEM_BG: Record<string, string> = {
  verde: "#dcfce7",
  amarillo: "#fef9c3",
  rojo: "#fee2e2",
  sin_datos: "#f1f5f9",
};

/* ─── Helpers de UI ─────────────────────────────────────────── */

function getMonthOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = -1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return [...new Set(out)].sort();
}

function semIcon(estado: string): string {
  if (estado === "verde") return "🟢";
  if (estado === "amarillo") return "🟡";
  if (estado === "rojo") return "🔴";
  return "⚪";
}

/* ═══════════════════════════════════════════════════════════ */

export default function PanelDeVerdad({
  user,
  orgId,
}: {
  user: User;
  orgId: string;
}) {
  const monthOptions = useMemo(getMonthOptions, []);
  const [from, setFrom] = useState<string>(() => monthOptions[Math.max(0, monthOptions.length - 5)]);
  const [to, setTo] = useState<string>(() => monthOptions[monthOptions.length - 2] ?? monthOptions[monthOptions.length - 1]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthOptions[monthOptions.length - 2] ?? monthOptions[monthOptions.length - 1]);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summaries, setSummaries] = useState<Record<string, CFOSummary | null>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);

  const fetchMonthly = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/treasury/monthly?from=${from}&to=${to}&recompute=true`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error cargando datos mensuales");
        return;
      }
      const list: Snapshot[] = data.snapshots ?? (data.snapshot ? [data.snapshot] : []);
      setSnapshots(list);
      // Si selectedMonth no está en el rango, ajusta
      if (list.length > 0 && !list.find((s) => s.monthId === selectedMonth)) {
        setSelectedMonth(list[list.length - 1].monthId);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [user, orgId, from, to, selectedMonth]);

  // Carga summary cacheado de cada mes (sin llamar a Claude)
  const fetchSummariesForRange = useCallback(async (months: string[]) => {
    const out: Record<string, CFOSummary | null> = {};
    await Promise.all(
      months.map(async (m) => {
        try {
          const res = await authedFetch(user, `/api/org/${orgId}/treasury/monthly-summary?month=${m}`);
          const data = await res.json();
          out[m] = data.summary ?? null;
        } catch {
          out[m] = null;
        }
      })
    );
    setSummaries(out);
  }, [user, orgId]);

  const generateSummary = useCallback(async (month: string, regenerate = false) => {
    setSummaryLoading(true);
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/treasury/monthly-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, regenerate, includePrevious: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setSummaries((prev) => ({ ...prev, [month]: data.summary }));
      } else {
        setError(data.error || "Error generando resumen");
      }
    } catch {
      setError("Error de conexión generando resumen");
    } finally {
      setSummaryLoading(false);
    }
  }, [user, orgId]);

  useEffect(() => {
    fetchMonthly();
  }, [fetchMonthly]);

  useEffect(() => {
    if (snapshots && snapshots.length > 0) {
      fetchSummariesForRange(snapshots.map((s) => s.monthId));
    }
  }, [snapshots, fetchSummariesForRange]);

  const selected = snapshots?.find((s) => s.monthId === selectedMonth) ?? null;

  /* ─── Render ──────────────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Mes inicial</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)} style={selectStyle}>
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Mes final</label>
          <select value={to} onChange={(e) => setTo(e.target.value)} style={selectStyle}>
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Mes destacado</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={selectStyle}>
            {(snapshots ?? []).map((s) => <option key={s.monthId} value={s.monthId}>{s.monthId}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 10, background: T.dangerBg, color: T.danger, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && <p style={{ color: T.muted, fontSize: 14 }}>Cargando snapshots…</p>}

      {/* KPI hero del mes seleccionado */}
      {selected && (
        <HeroKpis snapshot={selected} />
      )}

      {/* Card resumen CFO */}
      {selected && (
        <SummaryCard
          monthId={selected.monthId}
          summary={summaries[selected.monthId] ?? null}
          loading={summaryLoading}
          onGenerate={() => generateSummary(selected.monthId, false)}
          onRegenerate={() => generateSummary(selected.monthId, true)}
        />
      )}

      {/* Tabla escenarios del mes seleccionado */}
      {selected?.scenarios && selected.scenarios.length > 0 && (
        <ScenariosTable snapshot={selected} />
      )}

      {/* Evolución mensual de todos los meses cargados */}
      {snapshots && snapshots.length > 0 && (
        <MonthlyEvolution snapshots={snapshots} onSelect={setSelectedMonth} selected={selectedMonth} />
      )}

      {/* Warnings agrupados */}
      {snapshots && snapshots.length > 0 && (
        <WarningsAccordion snapshots={snapshots} />
      )}
    </div>
  );
}

/* ─── Sub-componentes ───────────────────────────────────────── */

function HeroKpis({ snapshot }: { snapshot: Snapshot }) {
  const sem = snapshot.semaforo;
  const ps = snapshot.possibleSalary;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
      <Kpi
        label="Estado del mes"
        value={sem ? `${semIcon(sem.estado)} ${sem.estado.toUpperCase()}` : "—"}
        sub={sem ? `con sueldo ${fmt(sem.salaryUsed)} €` : undefined}
        color={sem ? SEM_COLORS[sem.estado] : T.muted}
        bg={sem ? SEM_BG[sem.estado] : undefined}
      />
      <Kpi
        label="Ventas TPV"
        value={`${fmt(snapshot.cash.ventasTpv.total)} €`}
        sub={`${snapshot.cash.ventasTpv.count} liquidaciones`}
        color={T.success}
      />
      <Kpi
        label="Resultado caja"
        value={`${fmt(snapshot.cash.resultadoCaja)} €`}
        sub="entrada/salida real del banco"
        color={snapshot.cash.resultadoCaja >= 0 ? T.success : T.danger}
      />
      <Kpi
        label="Económico c/sueldo"
        value={`${fmt(snapshot.economic.resultadoEconomicoConSueldoFundador)} €`}
        sub={ps ? `máx posible ${fmt(ps.sueldoMaximo)} €` : "—"}
        color={snapshot.economic.resultadoEconomicoConSueldoFundador >= 0 ? T.success : T.danger}
      />
    </div>
  );
}

function Kpi({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color?: string; bg?: string }) {
  return (
    <div style={{
      background: bg ?? T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: "16px 18px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: T.dim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.mono, color: color ?? T.text, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SummaryCard({
  monthId, summary, loading, onGenerate, onRegenerate,
}: {
  monthId: string;
  summary: CFOSummary | null;
  loading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  const labels = {
    quePaso: "Qué pasó",
    porquePaso: "Por qué pasó",
    queBien: "Qué está bien",
    quePreocupa: "Qué te preocupa",
    queDecision: "Qué decisión tomar",
    sueldoGeremi: "Sueldo Geremi",
    queFaltaVerde: "Qué falta para verde",
  };
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: "20px 24px",
      marginBottom: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: T.text }}>
          Resumen CFO/CEO · {monthId}
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          {!summary && (
            <button onClick={onGenerate} disabled={loading} style={btnPrimaryStyle}>
              {loading ? "Generando…" : "Generar resumen"}
            </button>
          )}
          {summary && (
            <button onClick={onRegenerate} disabled={loading} style={btnGhostStyle}>
              {loading ? "Regenerando…" : "Regenerar"}
            </button>
          )}
        </div>
      </div>
      {!summary && !loading && (
        <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
          Aún no hay resumen para este mes. Pulsa &quot;Generar resumen&quot; para que Claude lo escriba.
        </p>
      )}
      {summary && (
        <div style={{ display: "grid", gap: 12 }}>
          {(Object.entries(labels) as Array<[keyof typeof labels, string]>).map(([key, label]) => (
            <div key={key} style={{ paddingLeft: 12, borderLeft: `3px solid ${T.accent}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
                {summary.blocks[key]}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: T.dim, marginTop: 4 }}>
            Generado {new Date(summary.generatedAt).toLocaleString()} · {summary.model}
          </div>
        </div>
      )}
    </div>
  );
}

function ScenariosTable({ snapshot }: { snapshot: Snapshot }) {
  if (!snapshot.scenarios) return null;
  const ps = snapshot.possibleSalary;
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: T.text }}>
        Escenarios sueldo Geremi · {snapshot.monthId}
      </h3>
      <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: T.bg }}>
              <th style={thStyle}>Sueldo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Caja con sueldo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Económico con sueldo</th>
              <th style={thStyle}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.scenarios.map((s) => (
              <tr key={s.salary} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={tdStyle}>{fmt(s.salary)} €</td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, color: s.cashWithSalary >= 0 ? T.success : T.danger }}>
                  {fmt(s.cashWithSalary)} €
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, color: s.economicWithSalary >= 0 ? T.success : T.danger }}>
                  {fmt(s.economicWithSalary)} €
                </td>
                <td style={tdStyle}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12,
                    background: SEM_BG[s.semaforo], color: SEM_COLORS[s.semaforo],
                  }}>
                    {semIcon(s.semaforo)} {s.semaforo}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ps && ps.gap > 0 && (
        <p style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>
          Para cubrir sueldo objetivo de {fmt(ps.sueldoObjetivo)} € faltan {fmt(ps.gap)} € de margen.
          Eso son {fmt(ps.ventasExtraMesEur)} € extra/mes ≈ {ps.ticketsExtraMes} tickets/mes
          ({ps.ticketsExtraDia}/día) a {ps.inputs.avgTicket} €/ticket con margen bruto del {(ps.inputs.grossMarginRatio * 100).toFixed(0)}%.
        </p>
      )}
    </div>
  );
}

function MonthlyEvolution({
  snapshots,
  onSelect,
  selected,
}: {
  snapshots: Snapshot[];
  onSelect: (m: string) => void;
  selected: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: T.text }}>Evolución mensual</h3>
      <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 880 }}>
          <thead>
            <tr style={{ background: T.bg }}>
              <th style={thStyle}>Mes</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Ventas TPV</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Gastos op</th>
              <th style={{ ...thStyle, textAlign: "right" }}>AEAT+SS</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Card pend.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Sin clas.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Caja</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Económico</th>
              <th style={{ ...thStyle, textAlign: "right" }}>FC%</th>
              <th style={thStyle}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => {
              const taxes = s.cash.impuestosAEAT.total + s.cash.seguridadSocial.total;
              const isSelected = s.monthId === selected;
              return (
                <tr
                  key={s.monthId}
                  onClick={() => onSelect(s.monthId)}
                  style={{
                    borderBottom: `1px solid ${T.border}`,
                    background: isSelected ? T.accentLight : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{s.monthId}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono }}>{fmt(s.cash.ventasTpv.total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, color: T.muted }}>{fmt(s.cash.gastosOperativosTotales)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, color: T.muted }}>{fmt(taxes)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, color: T.muted }}>{fmt(s.cash.tarjetaPendiente.total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, color: T.muted }}>{fmt(s.cash.sinClasificar.total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, fontWeight: 700, color: s.cash.resultadoCaja >= 0 ? T.success : T.danger }}>
                    {fmt(s.cash.resultadoCaja)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, fontWeight: 700, color: s.economic.resultadoEconomicoConSueldoFundador >= 0 ? T.success : T.danger }}>
                    {fmt(s.economic.resultadoEconomicoConSueldoFundador)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: T.mono, color: SEM_COLORS[s.foodCost.estado] }}>
                    {s.foodCost.foodCostPagadoPct.toFixed(1)}%
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12,
                      background: s.semaforo ? SEM_BG[s.semaforo.estado] : T.bg,
                      color: s.semaforo ? SEM_COLORS[s.semaforo.estado] : T.muted,
                    }}>
                      {s.semaforo ? `${semIcon(s.semaforo.estado)} ${s.semaforo.estado}` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WarningsAccordion({ snapshots }: { snapshots: Snapshot[] }) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const totalWarnings = snapshots.reduce((s, x) => s + x.warnings.length, 0);
  if (totalWarnings === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: T.text }}>
        Warnings ({totalWarnings})
      </h3>
      {snapshots.map((s) => {
        if (s.warnings.length === 0) return null;
        const open = openMonth === s.monthId;
        return (
          <div key={s.monthId} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
            <button
              onClick={() => setOpenMonth(open ? null : s.monthId)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "10px 14px",
                textAlign: "left",
                cursor: "pointer",
                color: T.text,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: T.font,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{s.monthId} — {s.warnings.length} warning{s.warnings.length !== 1 ? "s" : ""}</span>
              <span style={{ color: T.muted, fontSize: 11 }}>{open ? "▴" : "▾"}</span>
            </button>
            {open && (
              <div style={{ padding: "0 14px 12px" }}>
                {s.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 12, color: T.muted, marginBottom: 6, paddingLeft: 8, borderLeft: `2px solid ${
                    w.severity === "danger" ? T.danger : w.severity === "warn" ? T.warning : T.info
                  }` }}>
                    <strong>[{w.code}]</strong> {w.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Estilos compactos in-file ─────────────────────────────── */

const labelStyle: React.CSSProperties = { display: "block", fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 };
const selectStyle: React.CSSProperties = { padding: "7px 10px", fontSize: 13, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.font };
const thStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 11, fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", borderBottom: `1px solid ${T.border}` };
const tdStyle: React.CSSProperties = { padding: "10px 12px", color: T.text };
const btnPrimaryStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font };
const btnGhostStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font };
