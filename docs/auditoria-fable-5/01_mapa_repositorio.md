# 01 · Mapa del repositorio

> Evidencia recogida el 2026-07-03 sobre la rama
> `rescue/brain-prod-snapshot-enverde-free-first` (working tree con cambios sin commitear).

## Topología

```
raiz-app/                          monorepo npm workspaces (package.json raíz: "raiz-platform")
├── apps/
│   ├── app/                       PWA cliente Raíz — 111 archivos TS/TSX
│   ├── pos/                       TPV multi-tenant — 143 archivos TS/TSX (código en src/)
│   └── brain/                     Panel admin/CFO — 246 archivos TS/TSX
├── packages/
│   └── shared/                    23 archivos TS — ⚠️ NADIE lo importa (verificado por grep)
├── scripts/                       7 scripts raíz (seeds + e2e enverde)
├── docs/
│   ├── RAIZ-VS-ENVERDE.md         ★ mapa canónico de separación marcas/tenants (2026-06-05)
│   └── archive/                   9 docs históricos (auditorías, fases viejas)
├── firestore.rules                284 líneas, endurecidas (deploy MANUAL, fuera de Vercel)
├── firestore.indexes.json
├── firebase.json                  solo firestore (rules + indexes), región eur3
├── ARCHITECTURE.md                ★ actualizado 2026-05-08
├── PLAN.md                        ★ único doc de planning vivo (2026-05-08)
├── AGENT_STATUS.md / AGENT_DECISIONS.md   ★ estado canónico pre-piloto (2026-06-10)
├── AUDIT_ENVERDE_REPO.md          auditoría previa del funnel Enverde (2026-06-10)
├── package-lock.json  ⚠️  + pnpm-lock.yaml  ⚠️   (dos gestores en la raíz)
└── "Sin título.base"              ⚠️ archivo basura (Obsidian), gitignored
```

## Stack por app (evidencia: `apps/*/package.json`)

| | `apps/app` | `apps/pos` | `apps/brain` |
|---|---|---|---|
| Next.js | 14.2.35 | 14.2.35 | **^16.1.6** |
| React | ^18 | ^18 | **19.2.3** |
| UI | Radix + Tailwind (shadcn-style) | Radix + Tailwind (shadcn-style) | Tailwind 4 a pelo (sin Radix) |
| Backend | firebase-admin, stripe | firebase-admin, resend | firebase-admin, stripe |
| Tests | — | — | vitest (devDep, **sin script `test`**) |
| Extra | @stripe/react-stripe-js, vaul | html5-qrcode, date-fns | nanoid, picocolors |

⚠️ **Drift de versiones**: dos apps en Next 14/React 18, una en Next 16/React 19.
No es un bug, pero duplica el coste mental y de upgrades.

## Servicios externos

- **Firebase `raizygrano`** (único proyecto para los dos productos): Firestore
  (eur3) + Auth. Admin SDK vía `FIREBASE_ADMIN_JSON` / `GOOGLE_APPLICATION_CREDENTIALS`
  (+ `apps/app` acepta `FIREBASE_SERVICE_ACCOUNT_JSON` / par CLIENT_EMAIL+PRIVATE_KEY — inconsistente).
- **Vercel**: 3 proyectos (`app`, `pos`, `brain`), mismo team. Deploy por CLI
  desde el root de cada app (workflow deliberado, ver AGENT_DECISIONS).
  `apps/brain/vercel.json` define 1 cron: `/api/cron/expire-redemptions` (03:00).
- **Stripe live** (bonos exam-pass de Raíz): claves en `apps/app` y `apps/brain`
  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
- **Claude API** (`ANTHROPIC_API_KEY` + BYOK per-org vía
  `apps/brain/lib/secrets/org-anthropic-key.ts`, cifrado AES-GCM con `SECRETS_ENC_KEY`):
  extracción de facturas y CFO summaries.
- **Resend** (`apps/pos`): envío de recibos por email.
- **Dominios**: `*.raizygrano.com` (Raíz), `app.enverde.app` (Enverde/brain).
  El funnel público de Enverde vive en OTRO repo (`marketplace`).

## Arquitectura de datos (Firestore)

Dos modelos conviviendo por diseño (documentado en `docs/RAIZ-VS-ENVERDE.md`):

- **Top-level legacy (Raíz, single-tenant)**: `products`, `categories`, `tickets`
  (congelada), `inventory`, `cafe_users`, `config`, `orders`, `customer_profiles`,
  `loyalty_transactions`, `exam_passes`… Acceso staff por custom claim.
- **Multi-tenant (Enverde)**: `orgs/{orgId}/…` (tickets, recipes, catalog, skus,
  suppliers, bank_movements, treasury_*, community_posts…). Acceso por
  `orgs/{id}/members/{uid}` (server-only), gateado por `requireOrgMember` y rules.
- La constante `LEGACY_TOPLEVEL_ORG` (`raiz_y_grano`) está **duplicada a mano**
  en `apps/pos/src/lib/org-scope.ts` y `apps/brain/lib/pos-scope.ts` porque
  `packages/shared` no está cableado (documentado como decisión temporal).

## Autenticación y autorización

- **API brain**: Bearer idToken verificado con Admin SDK
  (`apps/brain/lib/require-auth.ts`: `verifyAuth`/`requireAuth`/`requireOrgMember`).
- **Staff**: `apps/brain/lib/require-staff.ts` — claims `staff:true`/`role`, con
  **fallback a Firestore `cafe_users` por email** (los baristas del POS no tienen
  claims; transitorio reconocido en el propio archivo).
- **Rules**: `firestore.rules` — loyalty guard (campos de puntos solo Admin SDK),
  redemptions/exam-passes `write: if false`, `orgs` create solo Admin SDK,
  subcolecciones `secrets`/`usage` excluidas del cliente.
- **Auditoría previa**: `apps/brain/SECURITY-ORGSCOPE-AUDIT.md` (90 rutas revisadas).

## Scripts

- **`scripts/` (raíz)**: e2e y smokes de Enverde (`enverde-quickcost-e2e.mjs`,
  `enverde-tpv-smoke.mjs`, `enverde-pos-login-proof.mjs`, `sandbox-margins-proof.mjs`)
  + ⚠️ `seed-meeting-combos` **por triplicado** (.js/.mjs/.ts).
- **`apps/brain/scripts/`**: 29 scripts CLI — administración de orgs (create/list/
  purge…) y operación treasury (ingest CSV, reclassify, validate, demo…). Es el
  "backoffice real" del proyecto: potente pero indocumentado y sin registro central.
- **`apps/pos/scripts/`**: 15 scripts de backfill/chequeo de datos (usuarios, claims,
  tickets, daily-stats) — mayormente de migraciones ya pasadas.

## Git

- Remoto: solo `origin/main` (= main local, último commit 3-jun `5b7cc39`).
- Rama activa `rescue/brain-prod-snapshot-enverde-free-first`: **47 commits por
  delante de main, no existe en el remoto**.
- Working tree: comunidad completa sin trackear (1.622 líneas) + 6 archivos
  modificados (destaca `seed-rules.ts` +352).
- Ramas locales viejas: `claude/pensive-spence` (feb), `enverde-integration`
  (2-jun), `pos-multitenant` (5-jun) — candidatas a limpieza tras verificar merge.

## Documentación: qué leer primero (para cualquier persona nueva)

1. `docs/RAIZ-VS-ENVERDE.md` — el doc más importante del repo.
2. `ARCHITECTURE.md` + `PLAN.md` — sistema y negocio.
3. `AGENT_STATUS.md` / `AGENT_DECISIONS.md` — estado y porqués de la fase actual.
4. Los README.md de las 3 apps son **boilerplate de create-next-app** (inútiles);
   ⚠️ `apps/brain/GUIA-IMPLEMENTACION.md` (feb-2026) está obsoleta y contiene el
   aviso de rotación de key que nunca se ejecutó — tras rotar, archivarla en `docs/archive/`.
