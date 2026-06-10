"use client";

/**
 * /org/[orgId]  (Fase 2.1 — hub Enverde: "casa" del sistema de rentabilidad)
 *
 * Destino del bridge /enverde-login tras la provisión. En vez de soltar al café
 * en una pantalla suelta de banco (treasury/start), aterriza aquí: un hub que
 * explica el sistema de rentabilidad (caja → ventas → margen → sueldo) y enlaza
 * a lo único disponible HOY (Caja y sueldo = treasury/start). El resto son
 * "próximo paso" honestos, sin prometer nada que no esté activo.
 *
 * Self-contained: auth propia (onAuthStateChanged), igual que treasury/start y
 * el resto de pages del brain. La única carga de datos es el endpoint read-only
 * profitability-summary (ProfitabilitySummary + ProfitabilityOnboarding, cada
 * uno self-contained); el resto son tarjetas + copy + enlaces. Cero lógica
 * financiera.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/authed-fetch";
import ProfitabilitySummary from "@/app/components/sections/ProfitabilitySummary";
import ProfitabilityOnboarding from "@/app/components/sections/ProfitabilityOnboarding";
import ProfitabilityDemo from "@/app/components/sections/ProfitabilityDemo";
import { trackActivation } from "@/lib/track-activation";

const ACCENT = "#3F6B2E";

export default function OrgHubPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = String(params?.orgId || "");

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [openingPos, setOpeningPos] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Ventas reales: handoff de identidad al TPV (mismo flujo que treasury/start).
  const openPos = useCallback(async () => {
    if (!user || openingPos) return;
    setOpeningPos(true);
    setPosError(null);
    trackActivation(user, orgId, "cta_pos_clicked", "hub");
    try {
      const r = await authedFetch(user, `/api/enverde/pos-login?orgId=${encodeURIComponent(orgId)}&next=/pos`);
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.ok && d.url) {
        window.location.href = d.url;
        return;
      }
      setPosError(d.error ?? "No pudimos abrir el TPV. Inténtalo de nuevo.");
    } catch {
      setPosError("No pudimos abrir el TPV. Inténtalo de nuevo.");
    }
    setOpeningPos(false);
  }, [user, orgId, openingPos]);

  if (!authReady) return <Centered>Cargando…</Centered>;
  if (!user) {
    return (
      <Centered>
        <p className="text-lg font-medium">Tu sesión no está activa.</p>
        <a href="https://enverde.app/activar" className="mt-2 text-sm underline">
          Vuelve a activar Enverde
        </a>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
        enverde · tu rentabilidad
      </p>
      <h1 className="mt-2 text-3xl font-black" style={{ color: "var(--t-text)" }}>
        ¿Tu negocio te paga a ti?
      </h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--t-muted)" }}>
        Enverde te ayuda a entender tu rentabilidad conectando tres piezas: caja,
        ventas y margen. Empezamos por tu banco para calcular tu sueldo recomendado.
      </p>
      <p className="mt-3 text-sm font-semibold" style={{ color: "var(--t-accent)" }}>
        No solo vendas. Entiende cuánto te queda.
      </p>

      {/* ─── Resumen de rentabilidad del mes (mismo endpoint que Márgenes;
           se monta en silencio: si aún no hay datos muestra CTAs, si falla
           la carga desaparece y el hub sigue explicando cómo empezar).
           El id es el ancla de los CTAs "summary" de la checklist. ──── */}
      <div id="resumen-rentabilidad">
        <ProfitabilitySummary user={user} orgId={orgId} authedFetch={authedFetch} variant="hub" />
      </div>

      {/* ─── Puesta a punto del diagnóstico (checklist de primer uso;
           estados completado/atención/pendiente desde el mismo endpoint
           read-only que el resumen — lib/profitability/readiness) ──── */}
      <ProfitabilityOnboarding user={user} orgId={orgId} authedFetch={authedFetch} />

      {/* ─── Cafetería demo (read-only, datos hardcoded en cliente; solo
           visible si a la org le faltan datos; no escribe nada) ────── */}
      <ProfitabilityDemo user={user} orgId={orgId} authedFetch={authedFetch} />

      {/* ─── Tarjeta principal · Caja y sueldo (disponible) ───── */}
      <a
        href={`/org/${orgId}/treasury/start`}
        onClick={() => trackActivation(user, orgId, "cta_upload_statement_clicked", "hub")}
        className="mt-8 block rounded-2xl border p-6 transition"
        style={{ borderColor: "var(--t-accent)", background: "var(--t-accent-light)" }}
      >
        <Badge tone="now">Disponible ahora</Badge>
        <h2 className="mt-3 text-xl font-black" style={{ color: "var(--t-text)" }}>
          Caja y sueldo
        </h2>
        <p className="mt-1 leading-relaxed" style={{ color: "var(--t-muted)" }}>
          Sube tu extracto y descubre cuánto puedes cobrarte sin poner en riesgo el negocio.
        </p>
        <span className="mt-4 inline-flex items-center gap-2 text-base font-bold" style={{ color: ACCENT }}>
          Calcular mi sueldo recomendado
          <span aria-hidden>→</span>
        </span>
      </a>

      {/* ─── Tarjetas secundarias · próximos pasos (honestas) ─── */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ActionCard
          href="/?section=products"
          state="Disponible"
          title="Productos"
          body="Ordena tu carta y prepara el cálculo de márgenes por producto."
          cta="Añadir productos"
          onClick={() => trackActivation(user, orgId, "cta_products_clicked", "hub")}
        />
        <ActionCard
          href="/?section=recipes"
          state="Disponible"
          title="Escandallos"
          body="Añade costes aproximados para entender qué margen deja cada producto."
          cta="Preparar escandallos"
          onClick={() => trackActivation(user, orgId, "cta_recipes_clicked", "hub")}
        />
        <ActionCard
          href="/?section=margins"
          state="Disponible"
          title="Márgenes"
          body="Descubre qué productos realmente pagan tu sueldo y cuáles solo te dan trabajo."
          cta="Ver márgenes"
        />
        <ActionCard
          href="#tpv"
          state="Disponible"
          title="Ventas"
          body="Cobra con el TPV y tus ventas reales alimentarán tus márgenes."
          cta={openingPos ? "Abriendo TPV…" : "Abrir TPV"}
          onClick={(e) => {
            e.preventDefault();
            openPos();
          }}
        />
        <NextStepCard
          title="Acciones para mejorar"
          body="Cuando tengamos caja, ventas y margen, Enverde te dirá qué cambiar para poder cobrarte más."
          state="Próximamente"
        />
      </div>
      {posError && (
        <p className="mt-3 text-sm" style={{ color: "var(--t-danger)" }}>{posError}</p>
      )}

      {/* ─── Pie · fórmula + honestidad + privacidad + gratis ─── */}
      <section className="mt-8 rounded-xl border p-5" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
        <p className="text-sm font-bold" style={{ color: "var(--t-text)" }}>
          Ventas + margen + caja = sueldo real del dueño.
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
          Hoy empezamos por tu banco. Después sumaremos ventas y márgenes para que el
          cálculo sea cada vez más preciso.
        </p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--t-dim)" }}>
          Tus datos son privados. No vendemos tus datos ni compartimos tus extractos.
          Gratis y sin tarjeta.
        </p>
      </section>
    </main>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */

function NextStepCard({
  title,
  body,
  state,
  note,
}: {
  title: string;
  body: string;
  state: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
      <Badge tone="soon">{state}</Badge>
      <h3 className="mt-3 text-base font-bold" style={{ color: "var(--t-text)" }}>
        {title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
        {body}
      </p>
      {note && (
        <p className="mt-3 text-xs font-medium" style={{ color: "var(--t-dim)" }}>
          {note}
        </p>
      )}
    </div>
  );
}

function ActionCard({
  href,
  state,
  title,
  body,
  cta,
  onClick,
}: {
  href: string;
  state: string;
  title: string;
  body: string;
  cta: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a href={href} onClick={onClick} className="block rounded-xl border p-5 transition" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
      <Badge tone="now">{state}</Badge>
      <h3 className="mt-3 text-base font-bold" style={{ color: "var(--t-text)" }}>
        {title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
        {body}
      </p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: ACCENT }}>
        {cta}
        <span aria-hidden>→</span>
      </span>
    </a>
  );
}

function Badge({ tone, children }: { tone: "now" | "soon"; children: ReactNode }) {
  const now = tone === "now";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={
        now
          ? { background: ACCENT, color: "#fff" }
          : { background: "var(--t-accent-light)", color: "var(--t-muted)" }
      }
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: now ? "#fff" : "var(--t-muted)" }} />
      {children}
    </span>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-1 px-6 text-center" style={{ color: "var(--t-muted)" }}>
      {children}
    </main>
  );
}
