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
 * el resto de pages del brain. NO hace fetch de datos: son tarjetas + copy +
 * enlaces. Cero lógica financiera.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

const ACCENT = "#3F6B2E";

export default function OrgHubPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = String(params?.orgId || "");

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

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

      {/* ─── Tarjeta principal · Caja y sueldo (disponible) ───── */}
      <a
        href={`/org/${orgId}/treasury/start`}
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
        />
        <ActionCard
          href="/?section=recipes"
          state="Disponible"
          title="Escandallos"
          body="Añade costes aproximados para entender qué margen deja cada producto."
          cta="Preparar escandallos"
        />
        <ActionCard
          href="/?section=margins"
          state="Disponible"
          title="Márgenes"
          body="Descubre qué productos realmente pagan tu sueldo y cuáles solo te dan trabajo."
          cta="Ver márgenes"
        />
        <NextStepCard
          title="Ventas"
          body="Registra lo que vendes para saber qué productos mueven tu negocio."
          state="Próximo paso"
          note="Pronto podrás conectar tus ventas"
        />
        <NextStepCard
          title="Acciones para mejorar"
          body="Cuando tengamos caja, ventas y margen, Enverde te dirá qué cambiar para poder cobrarte más."
          state="Próximamente"
        />
      </div>

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
}: {
  href: string;
  state: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <a href={href} className="block rounded-xl border p-5 transition" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
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
