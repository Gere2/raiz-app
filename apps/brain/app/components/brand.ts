/**
 * brand.ts — marca del Brain según el host (sin React; server + client safe).
 *
 * El Brain sirve DOS marcas desde el mismo deployment:
 *   - Raíz y Grano (single-tenant original), en cualquier host por defecto.
 *   - Enverde (CFO multi-tenant para cafeterías), en app.enverde.app.
 * El chrome (login, sidebar, títulos) debe seguir al host: un café que entra
 * por enverde.app no puede leer "Raíz y Grano / Brain" en su primer servicio.
 * Default = Raíz, así que Raíz no se ve afectada. Mismo criterio que layout.tsx.
 */

export const ENVERDE_HOSTS = new Set(["app.enverde.app", "www.enverde.app"]);

export function isEnverdeHost(host?: string | null): boolean {
  if (!host) return false;
  return ENVERDE_HOSTS.has(host.toLowerCase().split(":")[0]);
}

export type BrainBrand = {
  /** Clave estable para lógica condicional. */
  key: "enverde" | "raiz";
  /** Nombre completo — h1 del login. */
  name: string;
  /** Emoji de marca. */
  emoji: string;
  /** Título corto del logo del sidebar y back-links. */
  sidebarTitle: string;
  /** Subtítulo del login. */
  loginSub: string;
  /** Eslogan de marca (tesis de producto). */
  tagline: string;
  /** Texto del spinner de carga. */
  loadingLabel: string;
  /** Título del chrome en páginas sueltas (p. ej. /escandallo). */
  chromeTitle: string;
};

const ENVERDE: BrainBrand = {
  key: "enverde",
  name: "Enverde",
  emoji: "🌱",
  sidebarTitle: "Enverde",
  loginSub: "Tu sistema de rentabilidad",
  tagline: "No solo vendas. Entiende cuánto te queda.",
  loadingLabel: "Cargando Enverde...",
  chromeTitle: "Enverde",
};

const RAIZ: BrainBrand = {
  key: "raiz",
  name: "Raíz y Grano",
  emoji: "☕",
  sidebarTitle: "Brain",
  loginSub: "Brain — Centro de operaciones",
  tagline: "Centro de operaciones de Raíz y Grano.",
  loadingLabel: "Cargando Brain...",
  chromeTitle: "Raíz y Grano · Brain",
};

export function brandForHost(host?: string | null): BrainBrand {
  return isEnverdeHost(host) ? ENVERDE : RAIZ;
}
