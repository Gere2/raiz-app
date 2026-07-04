# raiz-app — Raíz y Grano + Enverde

Monorepo npm workspaces: `apps/app` (PWA cliente Raíz), `apps/pos` (TPV),
`apps/brain` (panel CFO, canónico de Enverde en app.enverde.app), sobre un
único Firebase (`raizygrano`). Lee primero `docs/RAIZ-VS-ENVERDE.md`
(separación marcas/tenants — fuente única), `AGENT_STATUS.md` /
`AGENT_DECISIONS.md` (estado y porqués) y `docs/auditoria-fable-5/`
(auditoría + backlog 2026-07).

- Node: `nvm use` (`.nvmrc` → 22; vitest no arranca con <20.12).
- Tests: `npm test` en `apps/brain` (vitest). CI en `.github/workflows/ci.yml`.
- Deploy: SOLO Vercel CLI por app (`apps/{app,pos,brain}` son proyectos
  separados); nunca deploy sin commit+push previo. Firestore rules se
  despliegan aparte y a mano (`firebase deploy --only firestore:rules`).
- Regla de fase: feature freeze hasta observar uso real del piloto Enverde.

## Retrieval

- Antes de leer ficheros enteros, pregunta a NeuroFS: usa `neurofs_context`
  (o `neurofs_search`) para obtener excerpts citables y mínimos.
- Al terminar una tarea que usó esos resultados, llama a `neurofs_feedback`
  una vez: rating yes/no/partial, los símbolos/paths que sirvieron, y
  cualquier identificador que debió aparecer y no apareció. Solo nombra
  símbolos verificados.
