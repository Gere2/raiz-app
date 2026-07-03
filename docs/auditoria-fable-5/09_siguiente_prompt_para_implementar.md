# 09 · Prompt para la siguiente conversación (implementación)

> Copia/pega esto en una sesión nueva de Claude Code con cwd = `/Users/gere/raiz-app`.

---

Actúa como ingeniero senior ejecutando el plan de la auditoría
`docs/auditoria-fable-5/` (léela primero: `00_resumen_ejecutivo.md` y
`07_backlog_priorizado.md`). Hoy NO auditamos: implementamos los P0/P1 en
orden, con verificación después de cada paso. El feature freeze de producto
sigue vigente (AGENT_DECISIONS.md): nada de features nuevas.

Contexto operativo:
- Deploy SOLO por Vercel CLI (nunca `firebase deploy` salvo
  `--only firestore:rules`, y solo si lo pido). No hagas deploy sin pedírmelo.
- La rama actual es `rescue/brain-prod-snapshot-enverde-free-first`.
- Yo ya roté la private key de Firebase Admin (tarea #1) — si no lo he hecho,
  recuérdamelo y para.

Tareas, en este orden, una a una y confirmando conmigo entre pasos:

1. **Respaldo de prod (backlog #2)**: dos commits — (a) feature comunidad
   completa (untracked: `apps/brain/app/api/community/`,
   `app/org/[orgId]/comunidad/`, `app/internal/community/`, `lib/community.ts`,
   `CommunityNav.tsx`, `CommunityHubCard.tsx` + modificados `layout.tsx`,
   `org/[orgId]/page.tsx`, `lib/firebase-collections.ts`), (b) treasury
   (`lib/treasury/seed-rules.ts`, `classify.ts`, `treasury/start/page.tsx`).
   Revisa el diff antes de commitear por si hay algo que no deba entrar.
   Después `git push -u origin` de la rama.
2. **Higiene rápida (#3)**: borrar `Sin título.base`, dejar solo
   `scripts/seed-meeting-combos.mjs` (borrar `.js` y `.ts`).
3. **Node + engines (#5)**: `.nvmrc` con la LTS que elijas (≥20.12), campo
   `engines` en los 4 package.json. Verifica que `npx vitest run` en
   `apps/brain` ya arranca con el Node nuevo.
4. **Tests (#6)**: script `"test": "vitest run"` en `apps/brain/package.json`
   y arreglar los 3 TS2367 (`__tests__/loyalty-engine.test.ts:196,201`,
   `__tests__/loyalty-hardening.test.ts:44`). `npx tsc --noEmit` debe quedar a 0.
5. **CI (#7)**: `.github/workflows/ci.yml` — en apps/brain: lint, tsc, vitest.
   Sin deploy. Que falle si `engines` no se cumple.
6. **`.env.example` (#8)**: uno por app documentando cada var que su código lee
   (greppea `process.env.`), con comentario de propósito. SIN valores reales.
7. **Rama canónica (#9)**: propónme el plan para que `main` vuelva a ser la
   rama de verdad (merge fast-forward probablemente) y ejecútalo cuando confirme.

Al terminar cada tarea: qué hiciste, qué verificaste y el comando exacto que
usaste. Si algo del repo contradice la auditoría, dilo antes de seguir.
No toques: nada de Stripe, nada de `firestore.rules`, nada del path de bonos,
nada de la PWA `apps/app`.

---

## Después de estos P0/P1 (siguiente sesión, no esta)

- Backlog #12-17 (P2): parsers bancarios según pilotos, rate limiting IA,
  un solo lockfile, decidir `packages/shared`, limpieza, deprecations.
- La sesión guiada con la cafetería amiga (#4) y el envío de `/piloto` (#11)
  son tareas tuyas, no de Claude — el código solo espera sus resultados.
