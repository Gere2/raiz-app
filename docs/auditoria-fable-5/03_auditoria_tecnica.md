# 03 · Auditoría técnica

> Cada hallazgo con evidencia y severidad. 🔴 crítico · 🟠 alto · 🟡 medio · 🟢 bajo.
> Al final: lo que está bien (también con evidencia).

## 🔴 CRIT-1 · Private key de Firebase Admin comprometida y sin rotar (5 meses)

- **Evidencia**: `apps/brain/GUIA-IMPLEMENTACION.md` (19-feb-2026) — "🚨 URGENTE:
  Rotar Private Key… tu documento contiene la private key completa del service
  account… borra la key vieja (la que tiene `private_key_id: 54d4bd8b…`)".
  El `private_key_id` del archivo activo `apps/pos/secrets/raizygrano-admin.json`
  hoy es `54d4bd8b55b1…` — **la misma**.
- **Impacto**: esa key da acceso total (Firestore, Auth) al proyecto `raizygrano`,
  que contiene datos personales de clientes reales de Raíz y datos financieros
  de las cafeterías Enverde. La key se pegó completa en un documento que salió
  del entorno controlado. No hay forma de saber quién la tiene.
- **Mitigación parcial existente**: el JSON no está en git (`.gitignore`:
  `**/secrets/`, `*-admin.json`; verificado con `git ls-files`). Irrelevante
  para la fuga original.
- **Fix** (30 min, sin código): GCP Console → Service Accounts →
  `firebase-adminsdk-fbsvc@raizygrano` → crear key nueva → reemplazar el JSON
  local y `FIREBASE_ADMIN_JSON` en los 3 proyectos Vercel → **borrar la key vieja**
  → verificar que las 3 apps siguen sirviendo. Después, archivar GUIA-IMPLEMENTACION.md.

## 🔴 CRIT-2 · El fuente de producción vive solo en este Mac

- **Evidencia**: `git ls-remote origin` → solo `main` (= local main, `5b7cc39`,
  3-jun). La rama activa `rescue/brain-prod-snapshot-enverde-free-first` lleva
  **47 commits** que no existen en ningún remoto. Además el working tree tiene
  la feature de comunidad **desplegada en prod pero sin commitear**: 1.622
  líneas untracked (`apps/brain/app/api/community/`, `app/org/[orgId]/comunidad/`,
  `app/internal/community/`, `lib/community.ts`, `CommunityNav.tsx`,
  `CommunityHubCard.tsx`) + 6 modificados (`lib/treasury/seed-rules.ts` +352 líneas).
- **Impacto**: disco muerto o robo del portátil = pérdida del código que corre en
  producción. El workflow "deploy por Vercel CLI sin git push" (decisión
  documentada) tiene este coste oculto: Vercel guarda el build, no tu repo.
- **Fix** (15 min): commitear comunidad + treasury; `git push -u origin
  rescue/brain-prod-snapshot-enverde-free-first`; decidir merge a main (el
  nombre "rescue/…" siendo la rama canónica es en sí una señal de deuda).

## 🔴 CRIT-3 · No hay red de seguridad: tests no ejecutables, sin CI, sin engines

- **Evidencia**:
  - `npx vitest run` en `apps/brain` revienta antes de arrancar:
    `SyntaxError: The requested module 'node:util' does not provide an export
    named 'styleText'` — vitest/rolldown exige Node ≥20.12; local: **v20.9.0**.
  - Ningún `package.json` tiene script `test` ni campo `engines`. No hay `.nvmrc`.
  - No existe `.github/workflows/`.
- **Impacto**: los 13 archivos de `apps/brain/__tests__/` (org-scope, loyalty,
  treasury, profitability — los tests que protegen el dinero) hoy no corren.
  Cualquier regresión llega a prod sin aviso; el "feature freeze" es la única
  protección real ahora mismo.
- **Fix**: subir Node local a ≥20.12 (o 22 LTS), `engines` + `.nvmrc`, script
  `"test": "vitest run"`, y un workflow mínimo (lint + tsc + vitest en brain).
  Nota: el CI no debe desplegar — el deploy sigue siendo Vercel CLI (decisión vigente).

## 🟠 ALT-1 · Configuración indocumentada (~50 env vars, cero `.env.example`)

- **Evidencia**: grep de `process.env.*` — brain usa ~25 vars propias
  (`SECRETS_ENC_KEY`, `ENVERDE_PROVISION_SECRET`, `CRON_SECRET`,
  `MARKETPLACE_API_SECRET`, `STAGING_API_TOKEN`, `PUBLIC_API_KEYS`,
  `DEMO_SNAPSHOT_SECRET`…), pos 11, app ~20. `find . -name '*.env.example'` → nada.
- **Impacto**: nadie (ni tú dentro de 6 meses) puede levantar esto desde cero.
  Además `apps/app` inicializa Admin SDK con un mecanismo distinto
  (`FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY`)
  al de pos/brain (`FIREBASE_ADMIN_JSON`) — dos formatos para el mismo secreto.
- **Fix**: `.env.example` por app con cada var, para qué sirve y dónde vive el
  valor real (Vercel). 1–2 h. Unificar el formato del service account cuando se rote la key.

## 🟠 ALT-2 · Rate limiting casi inexistente en el brain

- **Evidencia**: `grep -rl rateLimit apps/brain/app/api` → solo
  `exam-pass/quote/route.ts` (usa `lib/rate-limit.ts`). Las otras ~122 rutas, sin
  límite. En cambio `apps/app/api/create-payment-intent` sí limita (5/min/IP).
- **Impacto**: los endpoints que llaman a Claude (`invoices/extract`,
  `treasury/monthly-summary`, `api/public/extract-invoice` — este último
  **público**) son facturables por uso; un abuso quema cuota/dinero. Mitigación
  existente: cupo mensual free (`ENVERDE_FREE_AI_CALLS_PER_MONTH`) y BYOK per-org.
- **Fix**: aplicar `lib/rate-limit.ts` (ya existe) al menos a: rutas IA, provisión
  (`api/enverde/provision`), y `api/public/*`. Medio día.

## 🟠 ALT-3 · Drift de framework y de gestor de paquetes

- **Evidencia**: app/pos en Next 14.2.35 + React 18; brain en Next 16 + React 19.
  Raíz con `package-lock.json` **y** `pnpm-lock.yaml`; `apps/pos` con su propio
  `package-lock.json` anidado.
- **Impacto**: upgrades y fixes de seguridad ×2; el shim mental "qué API de Next
  estoy usando" cambia por app; dos lockfiles = builds no reproducibles según
  qué gestor toque el repo.
- **Fix**: elegir npm (es lo que usan los scripts del root), borrar
  `pnpm-lock.yaml` y el lock anidado; planificar upgrade de app/pos a Next 15/16
  **después** del piloto (no ahora: feature freeze).

## 🟡 MED-1 · Monolito `apps/brain/app/page.tsx` (939 líneas) + secciones gigantes

- **Evidencia**: `page.tsx` 939 líneas; `CustomersSection` 802;
  `TreasurySection` 761; `MeetingCombosSection` 752; `comunidad/page.tsx` 670.
  15 secciones planas en `app/components/sections/` navegadas por `?section=`.
- **Impacto**: coste de cambio alto y riesgo de tocar Raíz al tocar Enverde
  (mismo archivo). Ya mordió antes: la GUIA de feb-2026 nace de "page.tsx
  monolítica (~430 líneas)" — se ha duplicado desde entonces.
- **Fix**: no refactorizar ahora (freeze); regla de "no crecer": secciones nuevas
  = archivo nuevo + ruta propia. Refactor real solo si el piloto valida.

## 🟡 MED-2 · `requireStaff` con fallback a `cafe_users` por email

- **Evidencia**: `apps/brain/lib/require-staff.ts` — "(3) es el fallback que
  necesitamos hoy: el POS crea baristas en `cafe_users` sin setear custom claims".
  Y AUDIT previo §9: `requireAdmin` cortocircuita con `staff:true`, el gate de
  `/internal/pilot` lo tuvo que sortear con lógica propia.
- **Impacto**: dos fuentes de verdad para "quién es staff"; un doc en Firestore
  (editable por admin desde el POS) concede rol server-side. Aceptable
  single-tenant, frágil multi-tenant.
- **Fix futuro**: script que siembre claims al crear baristas y retirar el
  fallback. No urgente; documentado.

## 🟡 MED-3 · Reglas Firestore: flecos menores

- **Evidencia**: `firestore.rules` L249-255 — `allow update, delete: if
  isOrgMember(orgId)` sobre el doc `orgs/{orgId}`: **cualquier miembro puede
  borrar la org entera** (no solo owner/admin). L84-86: `users/{userId}` con
  `read, write: if isOwner` — sin validación de shape (p. ej. `orgIds`
  auto-escribible, ya señalado como NO autoritativo en RAIZ-VS-ENVERDE, bien).
- **Impacto**: bajo hoy (orgs de 1-2 personas), sube con equipos.
- **Fix futuro**: roles por miembro (`orgs/{id}/members/{uid}.role`) y gatear
  delete a owner. Nota positiva: el resto de rules están muy bien (ver abajo).

## 🟡 MED-4 · Tests: 3 errores de tipos + 2 env-dependientes

- **Evidencia**: `npx tsc --noEmit` (2026-07-03) → 3 × TS2367 en
  `__tests__/loyalty-engine.test.ts` (196, 201) y `loyalty-hardening.test.ts` (44).
  Ya registrados en AGENT_STATUS. `next build` y lint verdes según el mismo doc.
- **Fix**: trivial cuando se arregle el runner (CRIT-3); son comparaciones de
  literales sin overlap, probablemente asserts mal tipados.

## 🟢 BAJO · Higiene

- `"Sin título.base"` en el root (Obsidian, gitignored) — borrar.
- `seed-meeting-combos` ×3 en `scripts/`.
- READMEs boilerplate en las 3 apps.
- Ramas locales viejas: `claude/pensive-spence`, `enverde-integration`, `pos-multitenant`.
- `apps/pos/setup-email.sh` y 15 scripts de backfill de migraciones pasadas.
- `.DS_Store` en `apps/pos/` (gitignored, ruido).

## Lo que está BIEN (y no hay que "arreglar")

1. **Guards de auth unificados y correctos** — `require-auth.ts` verifica Bearer
   idToken con Admin SDK y `requireOrgMember` exige doc de membership (server-only).
   Auditoría de 90 rutas en `SECURITY-ORGSCOPE-AUDIT.md`, con razonamiento explícito
   de por qué NO se tocó la superficie customer-facing (exam-pass).
2. **`firestore.rules` maduras**: loyalty guard por diff de affectedKeys (L34-49),
   redemptions/exam_passes `write: if false`, `exam_pass_counters` cerrados del
   todo, `secrets`/`usage` excluidas del wildcard de subcolecciones (L271-275),
   orders create atribuido (L126-127). Nivel alto para un proyecto de una persona.
3. **Treasury Truth Layer con lógica pura testeada**: `classify.ts`,
   `transfer-detector.ts`, `monthly-aggregator.ts`, `scenarios.ts` son funciones
   puras con tests dedicados (`__tests__/treasury/`) — el patrón correcto.
4. **BYOK cifrado**: `lib/secrets/crypto.ts` (AES-GCM) + `org-anthropic-key.ts`,
   clave maestra en env, y el gitignore documenta la excepción con comentario.
5. **Decisiones registradas con porqué** (AGENT_DECISIONS.md) — incluye
   anti-decisiones ("NO se podaron los puntos de entrada…"). Esto vale oro.
6. **Validación e2e seria**: org desechable en prod + Admin SDK + Chrome headless,
   con autolimpieza verificada (patrón `scripts/enverde-quickcost-e2e.mjs`).

## Nota sobre performance y escalabilidad

No se midió runtime (auditoría estática). Señales estructurales: Firestore por
org escala bien horizontalmente para decenas–cientos de cafés; el punto caliente
previsible es `bank_movements` (un doc por movimiento — Raíz ya tiene 542 en 4
meses; un café mediano ~2k/año, sin problema). El cron único (expire-redemptions)
y las llamadas a Claude son los únicos procesos no-request. Nada bloquea el
piloto de 10.
