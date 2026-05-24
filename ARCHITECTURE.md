# ARCHITECTURE · Raíz y Grano

Cómo está construido el sistema hoy. Este documento se mantiene actualizado
con cualquier cambio estructural relevante. Lo histórico vive en
`docs/archive/`.

Última actualización: 2026-05-08

---

## 1. Topología

```
raiz-app/                         (monorepo, npm workspaces)
├── apps/
│   ├── app/                      Next.js — app pública / clientes (?)
│   ├── pos/                      Next.js — POS frontline (rápido, kiosk)
│   ├── brain/                    Next.js — admin / panel de Geremi
│   └── pos_v0_backup/            histórico, no tocar
├── packages/
│   └── shared/                   tipos compartidos
└── docs/archive/                 docs históricos (auditorías, fases viejas)
```

Stack:
- Next.js 16, React 19, TypeScript 5.9
- Firebase Admin (Firestore + Auth)
- Vercel deploy
- Claude API para extracción de invoices y CFO summaries

## 2. apps/brain — el panel admin

15 secciones en `app/components/sections/`. Agrupadas por sistema (no por
estructura de carpetas, viven todas planas):

| Grupo       | Secciones |
|-------------|-----------|
| Operaciones | HomeSection, TreasurySection, MarginsSection, InventorySection |
| Producto    | Recipes (en page.tsx directo), MeetingCombosSection, SeasonalRecipesSection, StagingSection, OrgConfigSection |
| Clientes    | CustomersSection, RewardsSection, QuizzesSection, MissionsSection, EventsSection |
| Sistema     | PosLinkSection, ReportsSection |

**99 endpoints API** bajo `app/api/org/[orgId]/…`. La mayoría siguen el patrón
CRUD por colección Firestore.

## 3. Treasury Truth Layer

El módulo más reciente y más completo. Vive en:

```
apps/brain/lib/treasury/
  ├── types.ts                   tipos compartidos
  ├── classify.ts                clasificador determinista (puro)
  ├── seed-rules.ts              25 reglas seed (Amazon, AEAT, TPV…)
  ├── seed-accounts.ts           BBVA / Santander / DEFAULT_ASSUMPTIONS
  ├── account-resolver.ts        bank/last4 helpers
  ├── transfer-detector.ts       detector de traspasos internos (puro)
  ├── monthly-aggregator.ts      caja vs económico (puro)
  ├── scenarios.ts               semáforo + sueldo posible + tickets (puro)
  ├── cfo-summary.ts             llamada a Claude con prompt caching
  └── store.ts                   wrapper Firestore (rules, accounts, accruals,
                                  assumptions)

apps/brain/app/api/org/[orgId]/treasury/
  ├── extract                    POST: subir extracto bancario
  ├── movements                  GET/PATCH: movimientos
  ├── categorize                 POST: legacy IA-only categorizer (PR previo)
  ├── reclassify                 POST: aplica reglas determinísticas batch
  ├── rules                      GET/POST: reglas + seed
  ├── accounts                   GET/POST: cuentas bancarias + seed
  ├── accruals                   GET/POST + [accrualId] PATCH/DELETE
  ├── assumptions                GET/POST: assumptions globales y por mes
  ├── transfers/detect           POST: detector PR2
  ├── monthly                    GET: snapshot caja+económico+semáforo
  ├── monthly-summary            POST/GET: CFO summary + cache
  ├── scenarios                  GET: tabla escenarios sueldo Geremi
  └── quarterly                  GET: vista trimestral legacy
```

UI principal: `app/components/sections/treasury/PanelDeVerdad.tsx`.

## 4. Datos en Firestore

Bajo `orgs/{orgId}/`:

```
bank_statements                  (un doc por extracto subido)
bank_movements                   (un doc por movimiento)
treasury_rules                   (reglas de clasificación)
treasury_accounts                (cuentas bancarias)
treasury_assumptions             (overrides por mes + _default)
treasury_accruals                (devengos manuales)
treasury_monthly_snapshots       (cache de snapshots + AI summary)
suppliers / [id] / invoices      (proveedores + facturas extraídas)
recipes / catalog / skus / packaging
customers / loyalty_transactions / loyalty_snapshots
```

## 5. Scripts CLI (carpeta `scripts/`)

18 scripts de tesorería que dan más capacidad que la UI. Los principales:

```
treasury-ingest-csv.mjs           ingesta directa CSV (BBVA, Santander)
treasury-reclassify-firestore.mjs reclassify batch sin tocar API
treasury-validate-monthly.mjs     valida agregador mensual
treasury-validate-transfers.mjs   dry-run del detector de traspasos
treasury-apply-transfers.mjs      aplica strong pairs detectados
treasury-dedupe-tpv.mjs           detector de duplicados TPV (PR2.5)
treasury-cfo-summary.mjs          regenera el resumen CFO/CEO
treasury-set-assumption.mjs       sobrescribe sueldo/avgTicket/etc por mes
treasury-set-economic-month.mjs   mueve un mov a su mes económico real
treasury-add-accrual.mjs          añade un devengo manual
treasury-delete-statement.mjs     borra un statement + sus movs
treasury-inspect.mjs              muestra el estado completo de DB
```

Todos usan firebase-admin con las credenciales de `.env.local` y se
ejecutan con `./node_modules/.bin/jiti scripts/<nombre>.mjs`.

## 6. Convenciones

- **Reglas Firestore**: `apps/brain/lib/firebase-collections.ts` centraliza
  los nombres de colecciones — usar `COLLECTIONS.X` en lugar de strings.
- **Auth en API**: usar `requireAuth(req)` en cada handler; `requireOrgMember`
  cuando aplique.
- **Tests**: Vitest está roto en este workspace por un binding de rolldown
  ausente. Mientras tanto los smoke tests viven en
  `__tests__/treasury/*.smoke.mjs` y se corren con jiti directamente.

## 7. Issues estructurales conocidos

- `lib/exam-pass/engine.ts` tenía bugs de TypeScript (id duplicado en spread)
  — arreglado mayo 2026.
- `/api/.../dashboard?days=30` devuelve 500 en algunos casos — no investigado.
- Tests de loyalty (`__tests__/loyalty-engine.test.ts`,
  `__tests__/loyalty-hardening.test.ts`) tienen errores de tipos preexistentes
  no relacionados con Treasury.
- Scripts CLI tienen más funcionalidad que la UI — debería encapsularse en
  botones para reducir deuda cognitiva.
