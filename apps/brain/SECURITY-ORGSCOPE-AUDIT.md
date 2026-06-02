# Auditoría de org-scoping — rutas `app/api/org/[orgId]/**`

> Motivada por la integración enverde (el brain es ahora multi-tenant en la MISMA
> instancia que Raíz y Grano). Objetivo: que ningún usuario lea/escriba datos de
> un org del que no es miembro. Ver `ENVERDE-BRIDGE.md` §6.

**Total auditado: 90 rutas.** El primitivo es `requireOrgMember(req, orgId)`
(`lib/require-auth.ts`): exige token válido **y** doc `orgs/{orgId}/members/{uid}`.
Test del primitivo: `__tests__/org-scope.test.ts` (403 no-miembro · ok miembro · 401 sin token).

## ✅ Endurecidas en este pase (25 rutas — `requireOrgMember` añadido)

Todas son **superficie de miembro/owner** (dashboard CFO + CRUD), donde el caller
legítimo ES miembro del org. Cambio seguro y verificado con `tsc`.

- **treasury (14):** `accounts`, `accruals`, `accruals/[accrualId]`, `assumptions`,
  `categorize`, `extract`, `monthly`, `monthly-summary`, `movements`, `quarterly`,
  `reclassify`, `rules`, `scenarios`, `transfers/detect`. ← superficie que toca enverde.
- **CRUD dashboard (9):** `invoices/apply`, `invoices/extract`, `notes/[noteId]`,
  `packaging/[packId]`, `recipes/[recipeId]/ingredients/[ingredientId]`,
  `recipes/[recipeId]/ingredients/from-catalog`, `recipes/[recipeId]/link-product`,
  `suppliers/[supplierId]/invoices`, `tasks/[taskId]`. (Sus rutas padre ya usaban
  `requireOrgMember` → patrón probado.)
- **staff analytics (2):** `badges`, `customers/backfill-org` (ya `staff`-gated; ahora
  además exigen membership del org concreto → un staff de A no toca datos de B).

> Nota: estas rutas mantienen su `requireAuth` previo + el nuevo `requireOrgMember`
> (que reverifica el token). Doble verify barato; se puede deduplicar luego.

## ⚠️ NO tocadas a propósito — `requireOrgMember` las ROMPERÍA o no aplica

Estas tienen **otro modelo de auth**; meterles `requireOrgMember` a ciegas rompería
clientes legítimos (la restricción "no cambiar comportamiento de miembros legítimos").
Fix correcto por categoría:

### A. exam-pass customer-facing — `me`, `purchase-init`, `redeem`, `cancel-pending`, `test/*`
El caller legítimo es un **cliente del café** (loyalty), **NO** un miembro del org.
`requireOrgMember` les daría 403 a todos → rompería bonos (Stripe **live**).
**Fix correcto:** confirmar que cada query filtra por `caller.uid` **y** por `orgId`
(aislamiento por dueño + contexto). NO añadir `requireOrgMember`.

### B. exam-pass `quote`
**Pública** (pricing). Dejar así; solo verificar que no filtra datos privados.

### C. exam-pass `admin/*` — `grant`, `redeem`, `customer-status`, `list-active-passes`
Ops de admin. No usan `requireAuth`/`staff` por el patrón estándar → **revisar su guard
real** y exigir admin/staff **+** membership del org. Inspección individual.

### D. loyalty staff/POS — `adjust`, `award`, `balance`, `expire-redemptions`,
`mission-complete`, `missions-reconcile`, `quiz-complete`, `reconcile`, `redeem`,
`redemption-use`, `redemption-validate`, `reverse`, `snapshot`
Comprueban `caller.staff` y operan sobre datos del org. **Deberían** añadir
`requireOrgMember`, PERO antes hay que **verificar que el POS autentica con un usuario
staff que ESTÁ en `orgs/{orgId}/members`** — si el POS usa un service account no-miembro,
añadirlo tumbaría el POS en producción. (`loyalty/economy` ya usa `requireOrgMember`, lo
que sugiere que el dashboard staff sí es miembro — confirmar que el POS también.)

### E. `sync-pos`
Sincronización del POS (`requireAuth` solo). Mismo gate que D: verificar el modelo de
auth del POS antes de exigir membership.

## Recomendación de orden (Fase 2 completa)
1. **Hecho:** treasury + CRUD dashboard (cierra la exposición de enverde). ✅
2. Verificar el modelo de auth del POS → si staff es miembro, endurecer grupo **D + E**.
3. Auditar queries de **A** (uid+orgId) y el guard de **C**.
4. Deduplicar el doble `requireAuth`+`requireOrgMember` en las rutas ya endurecidas.
