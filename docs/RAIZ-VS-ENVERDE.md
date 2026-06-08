# Raíz y Grano ↔ Enverde — separación (mapa canónico)

> Fuente única de la separación de marcas/tenants en este monorepo. Si tocas
> algo que distingue "Raíz" de "Enverde", léelo aquí primero y actualiza este
> doc. Última revisión: 2026-06-05.

## TL;DR

Un solo repo + **un solo proyecto Firebase (`raizygrano`)** sirven **dos productos**:

- **Raíz y Grano** — la cafetería original, **single-tenant**. Es la org canónica
  `raiz_y_grano`, que por historia vive en colecciones Firestore **top-level**
  (`products`, `categories`, `inventory`, `config`, …). Marca: ☕, tema claro/verde
  oscuro, dominios `*.raizygrano.com`.
- **Enverde** — CFO multi-tenant para cafeterías de terceros. Cada café es una
  **org adicional** bajo `orgs/{orgId}/…`. Marca: 🌱, tema oscuro `#0D0D10`,
  dominio `app.enverde.app`.

La separación es **"blanda"**: mismo código + mismo Firebase, distinguidos por
**dos ejes** (abajo) con módulos SoT por app. No hay split de repo ni de datos.

## Los dos ejes de "¿esto es Raíz o Enverde?"

| Eje | Pregunta | Cómo se resuelve | SoT (dónde vive) |
|-----|----------|------------------|------------------|
| **TENANT** (datos/features) | ¿de qué org son estos datos? | por `orgId`: Raíz = `raiz_y_grano` (top-level legacy) vs café = `orgs/{id}` | `apps/pos/src/lib/org-scope.ts` · `apps/brain/lib/pos-scope.ts` |
| **BRAND** (chrome/tema/título) | ¿qué marca pinto? | por **host**: `app.enverde.app` → Enverde, resto → Raíz | `apps/brain/app/components/brand.ts` (+ `brand-context.tsx`) |

**Normalmente coinciden** (un café Enverde entra por `app.enverde.app` con su
propia org), pero son ejes distintos a propósito: la marca se decide **pre-auth**
(host, sin org todavía → login/sidebar) y el tenant **post-auth** (org → datos).

### Constante canónica

`raiz_y_grano` es el `orgId` de Raíz. En código se expresa como
`LEGACY_TOPLEVEL_ORG` + `isLegacyTopLevel(orgId)`:

- `apps/pos/src/lib/org-scope.ts` (SoT del POS: `orgCollection`/`orgDoc` con shim)
- `apps/brain/lib/pos-scope.ts` (espejo en el brain: `posCollection`/`orgTickets`)

> **Por qué está duplicada en 2 sitios:** cada app despliega a su propio proyecto
> Vercel desde su `root dir` (`apps/pos`, `apps/brain`). `packages/shared`
> (`@raiz/shared`) existe pero **ningún app lo importa** → cablearlo arriesga esos
> deploys. Hasta resolver eso, la constante se mantiene idéntica en ambos sitios
> **a mano**. Si cambias el orgId de Raíz, cámbialo en LOS DOS.

## Qué es de cada quién

### Por app
- **`apps/app`** (PWA cliente: fidelidad, bonos, quizzes, Stripe **live**) →
  **100% Raíz**. Single-tenant, sin concepto de Enverde. Hardcodea `raiz_y_grano`
  en ~18 sitios (DRY pendiente, no es fuga de tenant: no hay Enverde aquí).
- **`apps/pos`** (TPV) → **multi-tenant** vía shim. Raíz = top-level (token
  `staff`), cafés = `orgs/{id}` (miembros). Header branded por org
  (`isRaiz ? ☕ Raíz y Grano : 🌱 Enverde`). 33 gates `isRaiz`.
- **`apps/brain`** (CFO/ops/escandallos) → **multi-tenant + marca por host**.
  Es el **panel canónico de Enverde** (`app.enverde.app`). Secciones Raíz-only
  (Control Tower, Combos Profes, gamificación Clientes/Recompensas/Eventos/
  Quizzes/Misiones) **ocultas** para cafés enverde vía `brand.key === "raiz"`.

### Por naturaleza
- **Raíz-only** (gamificación/fidelidad/colegio): loyalty economy + Control Tower,
  recompensas, quizzes, misiones, eventos, **Combos Profes**, bonos/exam-pass
  (catálogo hardcodeado al menú de Raíz), pedidos APP/TEACHER_APP del POS.
- **Enverde / genérico** (lo que vende Enverde): **Tesorería/CFO** (extracto→sueldo,
  semáforo, **calendario fiscal**), **escandallos**, inventario, proveedores,
  facturas-IA, márgenes.
- **Compartido / infra**: auth (Firebase), POS de venta→ticket→márgenes, theme
  tokens (`brain/app/components/theme.ts` → CSS vars por `data-brand`), provisión
  Enverde (`brain/app/api/enverde/*`), bridge de identidad brain→POS.

## Aislamiento de datos (Firestore)

- **Autoridad** = `orgs/{id}/members` (server-only). Las reglas gatean
  `orgs/{id}/**` por `isOrgMember`; el brain por `requireOrgMember`. **Sin fuga
  cross-tenant** por aquí.
- `users/{uid}.orgIds` es **auto-escribible** → NO autoritativo (solo lo usa
  `/api/my-orgs` para *elegir* org, no para conceder acceso). ⚠️ Nunca unificar
  `requireOrgMember` con `users.orgIds`.
- **Tickets** viven SIEMPRE en `orgs/{id}/tickets` (Raíz incluida; la top-level
  `tickets` quedó congelada) → no usan el shim.
- Raíz accede a top-level por claim `staff` (`isStaff()`); cafés por membership.

## Reglas para código nuevo

1. **Nunca** hardcodees `"raiz_y_grano"` — usa `LEGACY_TOPLEVEL_ORG`/`isLegacyTopLevel`.
2. Para colecciones de datos por org → `orgCollection`/`orgDoc` (POS) o
   `posCollection`/`orgTickets` (brain). Nunca leas top-level con `where(orgId==)`.
3. Para una feature **Raíz-only** → gatéala (`isRaiz` en POS, `brand.key === "raiz"`
   en el chrome del brain). El default = camino genérico (sirve a Enverde).
4. Para chrome/marca → `useBrand()` (brain) / `isRaiz` (POS). Nunca pintes "Raíz y
   Grano"/☕ sin condicionar por marca.

## Gaps de separación pendientes (prioridad)

| Prio | Gap | Nota |
|------|-----|------|
| 🟡 | `apps/app`: ~18 literales `raiz_y_grano` dispersos | DRY, no fuga (app es Raíz-pura). Consolidar a `RAIZ_ORG_ID`. |
| 🟡 | Bonos/exam-pass: catálogo hardcodeado al menú de Raíz | Infra per-café ya existe (`brain/lib/exam-pass/org-config.ts`); **APARCADO** hasta un café Pro real (tocar el Stripe vivo de Raíz sin usuarios = riesgo sin beneficio) → ver **Runbook** abajo. |
| 🟢 | `LEGACY_TOPLEVEL_ORG` duplicado (pos + brain) | Resolver vía `@raiz/shared` cuando los deploys lo soporten. |
| 🟢 | `pos-scope.ts` (brain) es mal nombre (es tenant-scope, no pos) | Renombrar = churn de 5 importadores; opcional. |
| 🟢 | Tema oscuro: greens/reds `#16a34a/#dc2626` hardcodeados en secciones Raíz del brain | Cosmético; iterar con verificación visual. |
| ⚪ | No-código: bonos vendibles, plantillas email Firebase Auth sin marca Enverde | Decisión de producto / consola Firebase. |

## Runbook: activar bonos/exam-pass per-café (cuando exista un café Pro real)

> **Aparcado a propósito** (decisión 2026-06): la infra de catálogo per-café
> existe, pero el motor de cobro/canje NO se activó. Hoy no tendría efecto (un
> café enverde no tiene superficie de compra ni canje de bonos) y tocar el path
> **Stripe vivo de Raíz** sin usuarios = riesgo sin beneficio. Cuando se onboarde
> un café Pro real, ejecutar **en este orden**:

**Precondición — el café define su catálogo:** escribir `orgs/{orgId}/settings/examPass`
(merge parcial sobre la canónica: `pricing`, `rules`, `included`, `premium`,
`milks`, `extras`, `pastries`). Ya lo resuelve `getExamPassConfig(orgId)`
(`apps/brain/lib/exam-pass/org-config.ts`, Raíz = early-return canónica) y lo
sirve `GET /api/org/[orgId]/exam-pass/catalog`.

1. **Superficie de COMPRA para clientes del café.** Hoy solo Raíz vende bonos vía
   su PWA `apps/app` (single-tenant, hardcodeada a Raíz). Un café enverde no tiene
   app de cliente → decidir dónde compran (¿PWA enverde multi-tenant? ¿link de
   compra por café?). **Sin esto, lo demás no sirve.** (Producto, no plumbing.)

2. **Desgatear el CANJE en el POS.** Los bonos/loyalty están gateados a `isRaiz`
   en `apps/pos` (`src/components/pos/payment-method-modal.tsx`, `src/app/pos/page.tsx`).
   Abrir esos gates a la org del café (con su catálogo), manteniendo Raíz igual.

3. **Activar el CÁLCULO per-café (motor Stripe).** `computeOrder`
   (`apps/app/lib/exam-pass/calc.ts:185`, **espejado** en `apps/brain/lib/exam-pass/calc.ts`)
   valida hoy contra el catálogo hardcodeado de módulo. Cambiar a
   `computeOrder(input, config = CANONICAL_EXAM_PASS_CONFIG)` y que el path de
   canje resuelva `getExamPassConfig(orgId)` y se lo pase:
   - `apps/brain/app/api/org/[orgId]/exam-pass/redeem/route.ts` (call site ~L106)
   - `apps/brain/lib/exam-pass/engine.ts` (call sites ~L439 validación, ~L858 quote)
   - **Raíz byte-idéntica por construcción:** el param opcional con default
     canónico deja a TODOS los callers actuales sin cambio; `getExamPassConfig("raiz_y_grano")`
     = canónica = default. El espejo cliente de `apps/app` (resumen, Raíz) NO se toca.
   - **Probar en TEST mode** (`ENABLE_EXAM_PASS_TEST_MODE=true`) un ciclo
     compra→canje de un café de prueba ANTES de desplegar el brain. Nunca a ciegas:
     es el cobro real de Raíz.

## Despliegue

Cada app = su propio proyecto Vercel (mismo team), deploy por `vercel --prod`
desde su carpeta (NO por push a main):
- `apps/app` → `*.raizygrano.com` (PWA Raíz, Stripe live — máxima cautela)
- `apps/pos` → `pos.raizygrano.com`
- `apps/brain` → `app.enverde.app` (Enverde) y su host Raíz

Ver `ARCHITECTURE.md`, `PLAN.md`.
