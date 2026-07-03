# 02 · Mapa funcional

> Estado real por módulo según el código y los docs de validación. Leyenda:
> ✅ completo y validado · 🟢 completo (sin validación humana) · 🟡 a medias ·
> 🔴 roto/no ejecutable · ⚪ muerto/abandonado.
> "Enverde" = útil para empaquetar/vender; "Raíz" = solo para la cafetería propia.

## apps/brain (panel admin — el corazón del producto)

### Páginas (11)

| Ruta | Qué es | Estado | ¿Para quién? |
|---|---|---|---|
| `/org/[orgId]` | **Hub de rentabilidad Enverde** (Resumen, Lectura rápida, checklist "Puesta a punto", vinculación TPV↔escandallo) | ✅ e2e 14/14 en prod (AGENT_STATUS 2026-06-10) | Enverde |
| `/` (page.tsx, 939 líneas) | Panel legacy con 15 secciones por `?section=` | 🟢 funciona; monolítico | Raíz (secciones gateadas por marca) |
| `/escandallo` | Editor de escandallos (592 líneas) | 🟢 | Ambos |
| `/org/[orgId]/treasury/start` | Subida de extracto bancario | 🟢 nunca probado con un banco real (AUDIT previo §7) | Enverde |
| `/org/[orgId]/comunidad` | Foro (posts/respuestas/votos) | 🟢 desplegado, **sin commitear** | Enverde |
| `/org/[orgId]/activation` | Resumen de activación | 🟢 | Enverde |
| `/enverde-login` | Bridge de login sin contraseña | ✅ | Enverde |
| `/internal/pilot` · `/internal/community` | Vistas internas (gate admin) | 🟢 | Interno |
| `/control-tower` | Torre de control loyalty | 🟢 | Raíz-only |
| `/org/[orgId]/settings/anthropic` | BYOK clave Anthropic per-org | 🟢 | Enverde |

### Módulos de negocio (lib/ + API)

| Módulo | Evidencia | Estado |
|---|---|---|
| **Treasury Truth Layer** (extracto→clasificación→caja vs económico→semáforo→sueldo→CFO summary IA) | `lib/treasury/` (10 módulos, 4 con tests) + 14 endpoints + 29 scripts CLI | ✅ el módulo más maduro; validado con datos reales de Raíz (542 movimientos, PLAN.md) |
| **Escandallos / recetas** | `api/org/[orgId]/recipes/**` (6 rutas), `catalog`, `skus`, `packaging` | ✅ e2e coste rápido (commit `51c6a1f`) |
| **Márgenes** | `api/org/[orgId]/margins` + `MarginsSection.tsx` | 🟢 POS > manual > estimación; margen estimado desde escandallo |
| **Profitability insights/readiness** | `lib/profitability/` + tests | ✅ reglas puras trazables |
| **Loyalty engine** (puntos, badges, misiones, quizzes) | `lib/loyalty-engine.ts` + 14 rutas `loyalty/*` | 🟢 Raíz-only |
| **Exam-pass / bonos** (compra Stripe + canje con créditos) | `lib/exam-pass/` + 12 rutas + webhook Stripe | ✅ Stripe **live** para Raíz; per-café APARCADO con runbook (RAIZ-VS-ENVERDE) |
| **Facturas IA** (extracción con Claude) | `api/org/[orgId]/invoices/extract·apply` + `api/public/extract-invoice` | 🟢 |
| **Comunidad** | `api/community/**` (11 rutas), `lib/community.ts` | 🟢 desplegado sin commitear |
| **Inventario brain** | `api/org/[orgId]/inventory-brain/**` (4 rutas) | 🟢 |
| **Provisión Enverde** | `api/enverde/provision` + `pos-login` | ✅ probado e2e con org desechable |
| **Staging proxy** | `api/staging/[...path]` → `STAGING_ENGINE_URL` | 🟡 uso incierto — verificar si el marketplace aún lo llama |
| Sync POS / dashboard / reports / seasonal / combos / vouchers / contacts / notes / tasks | rutas CRUD varias | 🟢/🟡 mezcla Raíz y Enverde |

### Legacy señalado en el propio código

- `api/org/[orgId]/treasury/categorize` — categorizador IA-only "legacy" (ARCHITECTURE.md §3) superado por `reclassify` determinista.
- `api/org/[orgId]/treasury/quarterly` — "vista trimestral legacy" (ídem).

## apps/pos (TPV — pos.raizygrano.com)

16 páginas (`src/app/*/page.tsx`): venta (`/pos`), productos, categorías,
inventario, `magic-inventory`, dashboard, insights, reports, receipts, users,
settings, teacher-order, login, enverde-login, acceso-denegado, home.

- **Multi-tenant vía shim** `src/lib/org-scope.ts` (33 gates `isRaiz`,
  doc RAIZ-VS-ENVERDE). Tickets SIEMPRE en `orgs/{id}/tickets`. ✅
- Las 9 rutas API locales son **proxies same-origin al brain** (CORS), no lógica
  duplicada (verificado: `api/org/[orgId]/loyalty/redemption-use/route.ts` es un proxy). ✅
- `send-receipt` con Resend. 🟢
- 15 scripts de backfill de migraciones pasadas — candidatos a archivo. ⚪

## apps/app (PWA cliente de Raíz)

21 páginas: home, login, onboarding, profile, cart, checkout (+confirmed/success),
orders, rewards, earn, badges, offline, teacher-orders, y el flujo completo de
bonos (`/bono`, comprar, pedir, condiciones, éxitos).

- **100% Raíz, hardcodea `raiz_y_grano` en ~18 sitios** (documentado como DRY
  pendiente, no fuga). Sin concepto de Enverde.
- Bonos exam-pass con Stripe live: ✅ (rules `exam_passes` server-only, quote por API).
- ⚠️ Dos endpoints de pago conviven: `api/create-payment-intent` (con rate
  limiter propio) y `api/payments/create` — mismo stack Stripe+admin, estilos
  distintos. Uno de los dos parece generación anterior: **confirmar cuál usa el
  checkout hoy y marcar el otro como legacy**.
- `NEXT_PUBLIC_USE_SERVER_LOYALTY` sugiere una migración cliente→servidor de
  loyalty a medio cerrar (flag aún leído).

## packages/shared

⚪ **Muerto**: 23 archivos (types de treasury/loyalty/recipe/…, `firebase.ts`,
`category-resolver.ts`, servicios) y **cero imports desde las apps** (grep de
`@raiz/shared` y `packages/shared`: solo 1 comentario). El motivo está
documentado (cablearlo arriesga los deploys per-app de Vercel), pero mantener
types "compartidos" que nadie usa es peor que no tenerlos: divergen en silencio.

## Duplicaciones y abandonos (lista completa)

| Qué | Evidencia | Veredicto |
|---|---|---|
| `packages/shared` sin consumidores | grep imports = 0 | Decidir: cablear o borrar |
| `seed-meeting-combos` ×3 (.js/.mjs/.ts) | `scripts/` | Dejar 1, borrar 2 |
| `create-payment-intent` vs `payments/create` | `apps/app/app/api/` | Identificar el vivo, retirar el otro |
| `treasury/categorize` + `quarterly` legacy | ARCHITECTURE.md §3 | Marcar deprecated en código |
| `LEGACY_TOPLEVEL_ORG` duplicada pos/brain | RAIZ-VS-ENVERDE | Consciente; resolver con shared o aceptar |
| `exam-pass/calc.ts` espejado app/brain | RAIZ-VS-ENVERDE runbook | Consciente; tocar solo con el runbook |
| GUIA-IMPLEMENTACION.md obsoleta | fecha feb-2026 | Archivar tras rotar la key |
| Ramas locales viejas (3) | `git branch` | Borrar tras verificar merge |
| `pnpm-lock.yaml` + `package-lock.json` raíz + lock anidado en pos | `ls` raíz | Un solo gestor |
| READMEs boilerplate ×3 | `apps/*/README.md` | Reescribir 5 líneas honestas c/u |
| Scripts backfill POS ya ejecutados | `apps/pos/scripts/` | Mover a `docs/archive/` o borrar |

## Qué sirve para empaquetar/vender (Enverde) vs qué es solo Raíz

- **Vendible ya**: hub de rentabilidad + treasury + escandallos/márgenes +
  TPV multi-tenant + comunidad + provisión/login sin fricción.
- **Solo Raíz (no empaquetar)**: PWA cliente completa, loyalty/gamificación
  (badges, misiones, quizzes, eventos, recompensas), combos profes,
  teacher-orders, control-tower, bonos (hasta que exista un café Pro real).
- **El corte ya está hecho en código** (gates por marca/tenant) — la separación
  es funcional, no física. Eso es suficiente para el piloto; el split físico
  solo se justificaría con tracción (ver 08_decisiones).
