# 07 · Backlog priorizado

> P0 = hoy · P1 = esta semana · P2 = este mes · P3 = con tracción.
> Impacto/Esfuerzo/Riesgo: A(lto) M(edio) B(ajo). Riesgo = riesgo de ejecutar la tarea.

| # | Prio | Área | Descripción | Imp. | Esf. | Riesgo | Archivos afectados | Recomendación |
|---|---|---|---|---|---|---|---|---|
| 1 | P0 | Seguridad | Rotar private key Firebase Admin comprometida (`54d4bd8b…`, feb-2026) y borrar la vieja | A | B | B | `apps/pos/secrets/raizygrano-admin.json`, env `FIREBASE_ADMIN_JSON` en 3 proyectos Vercel | Hacer HOY; smoke de las 3 apps tras rotar |
| 2 | P0 | Git | Commitear comunidad (1.622 líneas untracked) + cambios treasury, y push de la rama rescue | A | B | B | `apps/brain/app/api/community/**`, `app/org/[orgId]/comunidad/**`, `lib/community.ts`, `lib/treasury/seed-rules.ts`, `classify.ts`, `layout.tsx`, `org/[orgId]/page.tsx`, `firebase-collections.ts`, `treasury/start/page.tsx` | 2 commits separados (comunidad / treasury); push inmediato |
| 3 | P0 | Higiene | Borrar `Sin título.base` y 2 de 3 `seed-meeting-combos.*` | B | B | B | raíz del repo, `scripts/` | Conservar el `.mjs` (coherente con el resto) |
| 4 | P1 | Producto | Sesión guiada con 1 cafetería amiga (extracto real, carta real, móvil real) | A | M | B | n/a (personas) | Bloquea el piloto de 10; usar lista de observación de 05 |
| 5 | P1 | Infra | Node ≥20.12 + `.nvmrc` + `engines` en 4 package.json | A | B | B | `package.json` ×4, `.nvmrc` nuevo | Sin esto los tests no corren en ninguna máquina |
| 6 | P1 | Tests | Script `"test"` en brain + arreglar 3 × TS2367 | A | B | B | `apps/brain/package.json`, `__tests__/loyalty-engine.test.ts:196,201`, `__tests__/loyalty-hardening.test.ts:44` | Después de #5 |
| 7 | P1 | CI | GitHub Actions: lint + tsc + vitest (brain), sin deploy | A | B | B | `.github/workflows/ci.yml` nuevo | Deploy sigue por Vercel CLI (decisión vigente) |
| 8 | P1 | Config | `.env.example` por app (~50 vars) | A | B | B | `apps/{app,pos,brain}/.env.example` nuevos | Documentar nombre + propósito + dónde vive el valor |
| 9 | P1 | Git | Rama rescue → `main` (merge o rename) | M | B | M | git | El nombre "rescue/" como rama canónica es deuda mental |
| 10 | P1 | Marca | Plantillas email Firebase Auth con marca Enverde | M | B | B | Consola Firebase (no código) | Antes de enviar /piloto |
| 11 | P2 | Producto | Enviar `/piloto` a las 10 y observar 1-2 semanas (métrica: % con 1 extracto + 1 escandallo en 7 días) | A | A | B | `/internal/pilot`, `orgs/{org}/events` | Solo tras #4 y sus fixes |
| 12 | P2 | Treasury | Parsers/reglas para los bancos reales de los pilotos (hoy solo BBVA/Santander sembrados) | A | M | M | `apps/brain/lib/treasury/seed-accounts.ts`, `seed-rules.ts`, `extract` | Única excepción de producto al freeze: bloquea el aha-moment |
| 13 | P2 | Seguridad | Rate limiting en rutas IA, provisión y `api/public/*` | M | M | B | `apps/brain/lib/rate-limit.ts` (existe), `invoices/extract`, `treasury/monthly-summary`, `api/public/extract-invoice`, `api/enverde/provision` | Reusar el limiter de exam-pass/quote |
| 14 | P2 | Infra | Un solo gestor de paquetes (npm): borrar `pnpm-lock.yaml` y lock anidado de pos | M | B | M | raíz, `apps/pos/package-lock.json` | Verificar build de las 3 apps después |
| 15 | P2 | Arquitectura | Decidir `packages/shared`: cablear o borrar (hoy: 23 archivos, 0 imports) | M | M | M | `packages/shared/**`, tsconfig/paths de apps | Recomendado: borrar; recrear con tracción |
| 16 | P2 | Higiene | Limpiar ramas locales, backfills ejecutados, READMEs, archivar GUIA-IMPLEMENTACION.md | B | B | B | `apps/pos/scripts/**`, `apps/*/README.md`, `docs/archive/` | Tarde de limpieza única |
| 17 | P2 | Código | Marcar deprecated `treasury/categorize` y `quarterly` + confirmar cuál de los 2 endpoints de pago usa el checkout de apps/app | B | B | B | `api/org/[orgId]/treasury/{categorize,quarterly}`, `apps/app/app/api/{create-payment-intent,payments/create}` | Comentario + TODO; no borrar aún |
| 18 | P3 | Stack | Upgrade Next 14→16 en `apps/app` y `apps/pos` | M | A | A | 2 apps completas | Solo tras el piloto; una app cada vez |
| 19 | P3 | Refactor | Trocear `apps/brain/app/page.tsx` (939 líneas) en rutas por sección | M | A | M | `page.tsx`, `components/sections/**` | Regla interina: no crecer más el monolito |
| 20 | P3 | Auth | Claims staff reales; retirar fallback `cafe_users` | M | M | M | `apps/brain/lib/require-staff.ts`, script de siembra de claims | También unifica el gate de `/internal/pilot` |
| 21 | P3 | Rules | Roles por miembro en orgs; delete solo owner | M | B | M | `firestore.rules` L249-255, modelo `members` | Importa cuando haya cafés con empleados |
| 22 | P3 | Producto | Bonos per-café (runbook RAIZ-VS-ENVERDE) | M | A | A | ver runbook (calc.ts, engine.ts, redeem, POS gates) | SOLO con un café Pro real; toca Stripe live |
| 23 | P3 | Marca | `pos.enverde.app` para el TPV de cafés Enverde | B | B | B | DNS + proyecto Vercel `pos` | Decisión de marca; barato |

## No-hacer explícitos (anti-backlog)

- Migrar los datos top-level de Raíz a `orgs/` — estable y documentado; riesgo sin valor.
- Split del monorepo o del proyecto Firebase — solo con tracción/compliance.
- Rediseño de pantallas antes de la sesión guiada (#4).
- Features nuevas de cualquier tipo — freeze hasta observar uso real (regla vigente).
- Tocar la PWA cliente (`apps/app`) — Raíz-only, funciona.
