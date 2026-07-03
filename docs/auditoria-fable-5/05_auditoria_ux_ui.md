# 05 · Auditoría UX/UI

> ⚠️ Límite honesto: esta auditoría es **estática** (código, copys, estructura,
> docs de validación e2e). No ejecuté las apps ni observé a un usuario. Las
> afirmaciones visuales están marcadas como "no verificado en pantalla".
> La fuente más valiosa de UX pendiente es la sesión guiada con una cafetería
> real — que sigue sin hacerse (AUDIT previo §12, paso 1).

## Por persona

### Dueño de cafetería (Enverde) — flujo bueno, el mejor del sistema

Lo que el código garantiza hoy (validado e2e 14/14, AGENT_STATUS 2026-06-10):

- Alta sin contraseña (`/activar` → `/enverde-login` bridge) — fricción mínima. ✅
- Hub con jerarquía correcta: Resumen de rentabilidad → Lectura rápida
  (diagnóstico por reglas trazables) → checklist "Puesta a punto del
  diagnóstico" (6 pasos con estado). Estados vacíos honestos ("se llenará con
  ventas y costes", nunca "margen sano" sin datos). ✅
- Deep-link checklist→panel de vinculación idempotente
  (`#resumen-rentabilidad:vincular`, nunca abre vacío). Detalle de calidad raro
  de ver. ✅
- **Riesgos UX abiertos**: subir el primer extracto (formato de archivo, errores
  de parseo — nunca probado con banco ajeno); múltiples puntos de entrada a
  "subir extracto" (4: Resumen, checklist, tarjeta Caja, demo — decisión
  consciente de no podar, revisar tras uso real).

### Empleado/barista (POS) — funcional, cargado

- 16 páginas para un rol que necesita 3 (vender, cobrar, cerrar caja). La página
  de venta `/pos` es una sola pantalla (bien), pero la nav expone dashboard,
  insights, reports, users, settings, magic-inventory… ¿ve el barista todo esto?
  **No verificado en pantalla** — comprobar gates de rol en la sesión guiada.
- `acceso-denegado` como página dedicada: bien (error claro, no un crash).
- Recibo por email (Resend) — bien para café pequeño.

### Cliente final (PWA `apps/app`) — Raíz-only, envejecida

- Flujos completos (pedido, bono, loyalty) y con éxito/confirmación dedicados
  (`/checkout/confirmed`, `/bono/comprar/exito`…). Página `/offline` = pensaron
  en PWA de verdad.
- Es la app con el stack más viejo (Next 14/React 18) y sin tests. Mientras
  funcione para el campus, no tocar; no es parte de Enverde.

## Pantallas: mantener / vigilar / rediseñar (cuando haya datos)

| Pantalla | Veredicto | Por qué |
|---|---|---|
| Hub `/org/[orgId]` | **Mantener** | Es el producto; validado e2e |
| `PanelDeVerdad.tsx` (treasury) | **Mantener** | 624 líneas pero cohesivo |
| `/escandallo` | **Mantener** | Core del valor |
| `/org/[orgId]/treasury/start` | **Vigilar #1** | El paso más frágil del onboarding (archivo bancario real) |
| Brain legacy `/?section=…` | **Vigilar** | 15 secciones planas, URLs opacas; solo lo ve Raíz/quien opera — no gastar en rediseño pre-tracción |
| POS nav completa | **Vigilar** | Sobrecarga potencial para barista; verificar roles en vivo |
| `/org/[orgId]/comunidad` | Mantener | 670 líneas, recién desplegada; observar uso |
| PWA cliente | **No tocar** | Raíz-only, funciona, fuera de scope Enverde |

## Textos y microcopy

- El copy en español del lado Enverde es consistente y honesto (los commits lo
  tratan como feature: `f922d10` "cash-caution dice de qué mes es la foto de
  caja"). Mantener ese listón.
- Errores de API en español y accionables (`"No tienes acceso a esta
  organización"`, `require-staff`: `"Staff no identificable: token sin email"`). Bien.
- Plantillas de email de Firebase Auth **sin marca Enverde** (gap ⚪ conocido,
  RAIZ-VS-ENVERDE) — es consola de Firebase, no código; hacerlo antes del piloto
  de 10 (es lo primero que ve un café al registrarse).

## Deuda visual conocida (del propio repo)

- Greens/reds hardcodeados `#16a34a/#dc2626` en secciones Raíz del brain en tema
  oscuro (RAIZ-VS-ENVERDE, gap 🟢 cosmético).
- Dos temas (Raíz claro ☕ / Enverde oscuro 🌱) resueltos por CSS vars +
  `data-brand` (`brain/app/components/theme.ts`) — arquitectura de theming correcta.

## Recomendación UX única

No rediseñar nada hasta la sesión guiada. Llevar a esa sesión una lista de
observación concreta: (1) ¿entiende el semáforo sin explicación?, (2) ¿completa
la checklist solo?, (3) ¿su banco exporta algo que `treasury/extract` trague?,
(4) ¿en qué pantalla pregunta "¿y ahora qué?"? — y arreglar SOLO lo que ahí se
rompa (misma regla que AGENT_DECISIONS ya fijó).
