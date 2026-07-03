# 06 · Plan de acción

> Regla que gobierna todo el plan: **el feature freeze sigue vigente**
> (AGENT_DECISIONS 2026-06-10). Nada de lo de abajo añade features; es
> seguridad, respaldo, y la validación humana que lleva 3 semanas pendiente.

## HOY (≈2 horas, nada de código de producto)

1. **Rotar la private key de Firebase Admin** 🔴
   GCP Console → IAM → Service Accounts → `firebase-adminsdk-fbsvc@raizygrano`
   → Keys → crear JSON nuevo → reemplazar `apps/pos/secrets/raizygrano-admin.json`
   y la env `FIREBASE_ADMIN_JSON` en los 3 proyectos Vercel → **borrar la key
   `54d4bd8b…`** → smoke: login POS + hub enverde + 1 llamada API.
   (Instrucciones ya escritas en `apps/brain/GUIA-IMPLEMENTACION.md` desde febrero.)
2. **Poner el código de prod a salvo** 🔴
   - Commit 1: comunidad (`app/api/community/`, `comunidad/`, `internal/community/`,
     `lib/community.ts`, `CommunityNav.tsx`, `CommunityHubCard.tsx`, cambios en
     `layout.tsx`, `org/[orgId]/page.tsx`, `firebase-collections.ts`).
   - Commit 2: treasury (`seed-rules.ts` +352, `classify.ts`, `treasury/start/page.tsx`).
   - `git push -u origin rescue/brain-prod-snapshot-enverde-free-first`.
3. Borrar `"Sin título.base"` y 2 de los 3 `seed-meeting-combos`. (5 min, higiene.)

## ESTA SEMANA (≈1 día de trabajo técnico + 1 sesión con humano)

4. **Sesión guiada con 1 cafetería amiga** — el paso 1 del audit anterior,
   aún sin evidencia de ejecución. Alta desde SU móvil, SU extracto real, SU
   carta, 3 tickets reales. Anotar fricciones con la lista de observación de
   [05_auditoria_ux_ui.md](05_auditoria_ux_ui.md). **Esto decide todo lo demás.**
5. **Red de seguridad mínima**:
   - Node ≥20.12 local (o 22 LTS) + `.nvmrc` + `engines` en los 4 package.json.
   - `"test": "vitest run"` en brain; arreglar los 3 TS2367 de los tests loyalty.
   - `.github/workflows/ci.yml`: lint + `tsc --noEmit` + vitest (solo brain para
     empezar). Sin deploy — Vercel CLI sigue siendo el camino.
6. **`.env.example` por app** (~50 vars documentadas: nombre, para qué, dónde
   vive el valor).
7. **Merge de la rama rescue a `main`** (o renombrarla a main). Una rama canónica
   con nombre normal, push automático como hábito.
8. Plantillas email Firebase Auth con marca Enverde (consola, no código) —
   antes de enviar `/piloto` a las 10.

## ESTE MES (después de la sesión, con el piloto andando)

9. **Enviar `/piloto` a las 10 cafeterías** (solo tras arreglar lo que rompa la
   sesión guiada) y **observar 1-2 semanas**: `/internal/pilot` + `orgs/{org}/events`.
   Métrica única: % con 1 extracto + 1 escandallo en 7 días.
10. **Robustez del import bancario** según los bancos reales de los pilotos
    (añadir parsers/reglas a `lib/treasury/` — es el único código de producto
    justificado durante el freeze, porque bloquea el aha-moment).
11. Rate limiting en rutas IA + provisión + `api/public/*` (reusar `lib/rate-limit.ts`).
12. Unificar gestor de paquetes (npm; borrar `pnpm-lock.yaml` y el lock anidado de pos).
13. Decidir `packages/shared`: cablearlo (probando que los 3 deploys Vercel
    sobreviven) o borrarlo y bendecir la duplicación documentada. Media jornada;
    lo barato es borrarlo hoy y recrearlo con tracción.
14. Limpiar: ramas locales viejas, scripts de backfill ejecutados → `docs/archive/`,
    READMEs honestos de 5 líneas, archivar `GUIA-IMPLEMENTACION.md`.

## MÁS ADELANTE (con tracción demostrada, no antes)

- Upgrade Next 14→16 de `apps/app` y `apps/pos` (unificar stack).
- Refactor de `apps/brain/app/page.tsx` (939 líneas) a rutas por sección.
- Claims de staff reales (retirar fallback `cafe_users` de `require-staff.ts`).
- Roles por miembro en orgs (owner/admin/member) + gatear delete de org.
- Bonos per-café: ejecutar el runbook de RAIZ-VS-ENVERDE **solo** cuando exista
  un café Pro real que los pida.
- `pos.enverde.app` como dominio del TPV para cafés Enverde (decisión de marca).
- Dashboard de márgenes con histórico/tendencias (hoy es foto del mes).

## Qué NO tocar todavía

- **El path de Stripe live de Raíz** (compra/canje de bonos) — regla ya escrita
  en el runbook; sin usuarios nuevos no hay beneficio, solo riesgo de romper cobros reales.
- **La migración de datos top-level de Raíz a `orgs/`** — convivencia documentada
  y estable; migrar es semanas de riesgo sin valor para el piloto.
- **Split del monorepo** (Raíz vs Enverde en repos/proyectos Firebase separados)
  — solo con tracción y/o requisito de compliance.
- **Rediseños de pantallas** — todo lo visual espera a la sesión guiada.
- **La PWA cliente (`apps/app`)** — funciona para el campus; es la última prioridad.

## Priorización impacto × esfuerzo

| | Esfuerzo bajo | Esfuerzo medio | Esfuerzo alto |
|---|---|---|---|
| **Impacto alto** | Rotar key · push/commits · engines+CI · .env.example · emails branded | Sesión guiada + fixes que salgan · parsers bancarios · rate limiting IA | Piloto 10 + observación disciplinada |
| **Impacto medio** | Higiene (locks, seeds, ramas, READMEs) | Borrar/cablear shared · claims staff | Upgrade Next app/pos · refactor page.tsx |
| **Parece importante pero NO ahora** | — | Rediseñar nav del brain legacy | Migrar Raíz a orgs/ · split de repo · bonos per-café |
