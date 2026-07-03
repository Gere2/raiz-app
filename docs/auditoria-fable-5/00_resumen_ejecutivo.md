# 00 · Resumen ejecutivo — Auditoría raiz-app (2026-07-03)

> Auditoría completa del monorepo `raiz-app` (Raíz y Grano + Enverde).
> Solo lectura: no se cambió código, no se borró nada, no se desplegó nada.
> Complementa (no sustituye) `AUDIT_ENVERDE_REPO.md` (2026-06-10), que auditó
> el funnel Enverde; esta cubre **todo el repo** y encontró riesgos que aquella no.

## Qué es esto realmente

Un monorepo (npm workspaces) con **dos productos sobre el mismo Firebase** (`raizygrano`):

1. **Raíz y Grano** — la cafetería real del campus UFV. Single-tenant, colecciones
   Firestore top-level. Facturación ~8.700 €/mes TPV (PLAN.md, datos ene–may 2026).
2. **Enverde** — CFO de rentabilidad multi-tenant para otras cafeterías
   (`orgs/{orgId}/…`), en fase piloto (10 cafeterías), feature freeze desde 2026-06-10.

Tres apps desplegadas en Vercel (proyectos `app`, `pos`, `brain` — evidencia:
`apps/*/.vercel/project.json`):

| App | Qué es | Stack | Estado |
|---|---|---|---|
| `apps/app` | PWA cliente de Raíz (fidelidad, pedidos, bonos con Stripe **live**) | Next 14.2.35 / React 18 | Live, Raíz-only |
| `apps/pos` | TPV multi-tenant (pos.raizygrano.com) | Next 14.2.35 / React 18 | Live |
| `apps/brain` | Panel admin/CFO, canónico de Enverde (app.enverde.app) | Next 16 / React 19 | Live, 123 endpoints API |

## Las 3 cosas que importan hoy (todas fuera del código)

1. **🔴 La private key de Firebase Admin comprometida en feb-2026 NUNCA se rotó.**
   `apps/brain/GUIA-IMPLEMENTACION.md` (19-feb-2026) marca como "URGENTE" rotar la
   key `54d4bd8b…` porque se pegó completa en un documento externo. La key activa
   hoy en `apps/pos/secrets/raizygrano-admin.json` tiene ese mismo
   `private_key_id` (`54d4bd8b55b1…`). Quien tenga ese documento tiene acceso
   total a Firestore/Auth de un negocio real con datos de clientes reales.
   El archivo NO está en git (`.gitignore` lo cubre), pero eso no mitiga la fuga original.

2. **🔴 El código fuente de producción existe solo en este Mac.**
   `origin/main` está en el commit del 3-jun (`5b7cc39`). La rama de trabajo
   `rescue/brain-prod-snapshot-enverde-free-first` lleva **47 commits sin subir**,
   y encima hay **~2.000 líneas sin commitear** que ya están desplegadas en prod:
   toda la feature de comunidad (`apps/brain/app/api/community/`,
   `app/org/[orgId]/comunidad/`, `lib/community.ts` — 1.622 líneas untracked) y
   +352 líneas en `lib/treasury/seed-rules.ts`. Si este disco muere, se pierde
   el fuente de lo que corre en producción.

3. **🟠 No hay red de seguridad para tocar código.**
   Sin CI (`no existe .github/workflows`), sin script `test` en ningún
   package.json, y `npx vitest run` **ni siquiera arranca** con el Node local
   (20.9.0; vitest/rolldown exige ≥20.12: `SyntaxError … styleText`). Los 13
   archivos de test de `apps/brain/__tests__/` hoy no son ejecutables en esta máquina.
   Ningún package.json declara `engines`.

## Lo que está sorprendentemente bien

- **Seguridad de aplicación**: guards unificados (`apps/brain/lib/require-auth.ts`,
  `require-staff.ts`), auditoría org-scope de 90 rutas documentada
  (`SECURITY-ORGSCOPE-AUDIT.md`), `firestore.rules` endurecidas (loyalty
  server-only, secrets/usage fuera del cliente, orders atribuidos).
- **El Treasury Truth Layer** es el mejor módulo: lógica pura separada de I/O
  (`apps/brain/lib/treasury/` — classify, transfer-detector, monthly-aggregator,
  scenarios), con tests y 29 scripts CLI de operación.
- **Documentación viva real**: `ARCHITECTURE.md`, `PLAN.md`, `RAIZ-VS-ENVERDE.md`
  (mapa canónico de la separación de marcas/tenants), `AGENT_STATUS.md`/
  `AGENT_DECISIONS.md`. Muy por encima de lo normal en un proyecto de una persona.
- **Filosofía de producto coherente**: "sin coste no se inventa margen" está
  implementada de verdad (hub honesto en vacío, commit `c355f08`).

## Diagnóstico en una frase

El producto está más sano que su infraestructura: Enverde tiene un core vendible
(extracto→sueldo + escandallos→margen) validado e2e, pero corre sobre una key
comprometida sin rotar, un repo cuya versión de producción vive solo en un
portátil, y cero red de seguridad (CI/tests/engines) — todo arreglable en días,
nada de ello es código de producto.

## Las 5 prioridades absolutas

1. **Rotar la private key de Firebase Admin hoy** (GCP Console → nueva key →
   borrar `54d4bd8b…` → actualizar `.env.local`/Vercel donde aplique).
2. **Commit + push de todo lo desplegado**: commitear la comunidad y los cambios
   de treasury, subir la rama rescue al remoto y decidir si pasa a ser `main`.
3. **Red de seguridad mínima**: fijar Node (`engines` + `.nvmrc`), arreglar el
   runner de tests, script `test`, y un CI de GitHub Actions con
   `lint + tsc + vitest` (sin deploy — el deploy sigue siendo Vercel CLI).
4. **Sesión guiada con 1 cafetería amiga** (ya era el paso 1 del audit anterior;
   sigue sin evidencia de haberse hecho): extracto bancario real + carta real +
   móvil real. Es el único bloqueo de producto real antes del piloto de 10.
5. **Inventario de configuración**: `.env.example` por app (~25 vars en brain,
   11 en pos, 20 en app — hoy no documentadas en ningún sitio) + borrar o
   cablear `packages/shared` (23 archivos que nadie importa).

## Documentos de esta auditoría

- [01_mapa_repositorio.md](01_mapa_repositorio.md) — estructura, stack, arquitectura
- [02_mapa_funcional.md](02_mapa_funcional.md) — pantallas, módulos, estado real
- [03_auditoria_tecnica.md](03_auditoria_tecnica.md) — riesgos y deuda, con evidencia
- [04_auditoria_producto.md](04_auditoria_producto.md) — valor, MVP, diferenciación
- [05_auditoria_ux_ui.md](05_auditoria_ux_ui.md) — flujos por persona, pantallas
- [06_plan_de_accion.md](06_plan_de_accion.md) — hoy / semana / mes / después
- [07_backlog_priorizado.md](07_backlog_priorizado.md) — tabla accionable
- [08_decisiones_estrategicas.md](08_decisiones_estrategicas.md) — decisiones del fundador
- [09_siguiente_prompt_para_implementar.md](09_siguiente_prompt_para_implementar.md) — prompt para la fase de implementación
