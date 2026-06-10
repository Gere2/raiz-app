"use client";

/**
 * /internal/pilot — vista interna agregada del piloto Enverde.
 *
 * Una fila por org del piloto (alta vía enverde) con sus estados de
 * activación: demo, extracto, productos/escandallos, ventas manuales,
 * feedback y último evento, con link al detalle /org/{orgId}/activation.
 *
 * Ruta oculta (sin links en nav) y protegida en el API por admin interno
 * (claim role=admin o cafe_users admin): otros usuarios ven 403 aquí.
 * Privacidad: solo nombres de org, flags sí/no y fechas — nunca importes,
 * productos, extractos ni datos de clientes.
 *
 * Self-contained: auth propia con login Google, como /control-tower.
 */
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { signInWithGoogle, consumeRedirectResult } from "@/lib/auth-client";
import { authedFetch } from "@/lib/authed-fetch";

type PilotOrg = {
  orgId: string;
  name: string;
  createdAt: string | null;
  demoOpened: boolean;
  extractClicked: boolean;
  productsClicked: boolean;
  manualSalesClicked: boolean;
  summarySeen: boolean;
  feedbackCount: number;
  lastEvent: { type: string; timestamp: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  demo_opened: "Demo abierta",
  demo_closed: "Demo cerrada",
  cta_upload_statement_clicked: "Subir extracto",
  cta_products_clicked: "Productos",
  cta_recipes_clicked: "Escandallos",
  cta_manual_sales_clicked: "Ventas manuales",
  cta_pos_clicked: "TPV abierto",
  pos_product_linked: "Producto TPV vinculado",
  profitability_summary_seen: "Resumen visto",
  onboarding_step_clicked: "Paso de onboarding",
};

export default function InternalPilotPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [orgs, setOrgs] = useState<PilotOrg[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    consumeRedirectResult();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const load = useCallback(async (u: User) => {
    setLoading(true);
    try {
      const r = await authedFetch(u, "/api/internal/pilot");
      if (r.ok) {
        const data = await r.json();
        setOrgs(Array.isArray(data?.orgs) ? data.orgs : []);
      } else if (r.status === 403) {
        setForbidden(true);
      } else {
        setError(true);
      }
    } catch (e) {
      console.error("Pilot overview:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load(user);
  }, [user, load]);

  if (!authReady) return <Centered>Cargando…</Centered>;

  if (!user) {
    return (
      <Centered>
        <p className="text-lg font-medium" style={{ color: "var(--t-text)" }}>
          Vista interna del piloto
        </p>
        <p className="text-sm">Inicia sesión con tu cuenta del equipo.</p>
        <button
          onClick={() => signInWithGoogle()}
          className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: "var(--t-accent)" }}
        >
          Entrar con Google
        </button>
      </Centered>
    );
  }

  if (forbidden) {
    return (
      <Centered>
        <p className="text-lg font-medium" style={{ color: "var(--t-text)" }}>
          Solo equipo interno
        </p>
        <p className="text-sm">Esta vista es del seguimiento del piloto y tu cuenta no tiene acceso.</p>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
        enverde · interno
      </p>
      <h1 className="mt-2 text-3xl font-black" style={{ color: "var(--t-text)" }}>
        Piloto Enverde — vista agregada
      </h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--t-muted)" }}>
        Estado de activación de todas las cafeterías del piloto en una sola pantalla,
        sin entrar org por org.
      </p>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--t-dim)" }}>
        Solo nombres de org, estados sí/no y fechas. Sin importes, sin productos, sin datos de clientes.
      </p>

      {loading && <p className="mt-8 text-sm" style={{ color: "var(--t-muted)" }}>Cargando piloto…</p>}
      {error && !loading && (
        <p className="mt-8 text-sm" style={{ color: "var(--t-muted)" }}>
          No se pudo cargar la vista. Recarga la página o vuelve más tarde.
        </p>
      )}

      {orgs && orgs.length === 0 && !loading && (
        <section className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--t-text)" }}>
            Aún no hay cafeterías en el piloto
          </h2>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
            En cuanto un café se dé de alta desde enverde.app aparecerá aquí con sus señales.
          </p>
        </section>
      )}

      {orgs && orgs.length > 0 && (
        <div className="mt-8 overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Café", "Alta", "Demo", "Extracto", "Productos", "Ventas man.", "Feedback", "Último evento", ""].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--t-dim)", borderBottom: "1px solid var(--t-border)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.orgId}>
                  <td className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--t-border)" }}>
                    <span className="font-medium" style={{ color: "var(--t-text)" }}>{o.name}</span>
                    <span className="block text-[11px]" style={{ color: "var(--t-dim)" }}>{o.orgId}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--t-muted)", borderBottom: "1px solid var(--t-border)" }}>
                    {o.createdAt ? new Date(o.createdAt).toLocaleDateString("es-ES", { dateStyle: "short" }) : "—"}
                  </td>
                  <Flag on={o.demoOpened} />
                  <Flag on={o.extractClicked} />
                  <Flag on={o.productsClicked} />
                  <Flag on={o.manualSalesClicked} />
                  <td className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--t-border)" }}>
                    {o.feedbackCount > 0 ? (
                      <span className="font-bold" style={{ color: "var(--t-accent)" }}>Sí · {o.feedbackCount}</span>
                    ) : (
                      <span style={{ color: "var(--t-dim)" }}>No</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--t-muted)", borderBottom: "1px solid var(--t-border)" }}>
                    {o.lastEvent ? (
                      <>
                        {TYPE_LABELS[o.lastEvent.type] ?? o.lastEvent.type}
                        <span className="block text-[11px]" style={{ color: "var(--t-dim)" }}>
                          {new Date(o.lastEvent.timestamp).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ borderBottom: "1px solid var(--t-border)" }}>
                    <a href={`/org/${o.orgId}/activation`} className="text-sm font-bold underline" style={{ color: "var(--t-accent)" }}>
                      Detalle
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Flag({ on }: { on: boolean }) {
  return (
    <td className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--t-border)" }}>
      {on ? (
        <span
          aria-label="sí"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: "var(--t-accent)" }}
        >
          ✓
        </span>
      ) : (
        <span aria-label="no" style={{ color: "var(--t-dim)" }}>—</span>
      )}
    </td>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-1 px-6 text-center" style={{ color: "var(--t-muted)" }}>
      {children}
    </main>
  );
}
