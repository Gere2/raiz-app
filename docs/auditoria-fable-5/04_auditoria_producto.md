# 04 · Auditoría de producto

> Enverde como producto para cafeterías pequeñas. Base: código + docs de
> validación + datos de negocio de PLAN.md. No se entrevistó a ningún café
> (eso ES el siguiente paso, no esta auditoría).

## Qué problema resuelve (el de verdad)

**"¿Puedo pagarme un sueldo con mi cafetería, y qué producto me lo está
impidiendo?"** — no "cobrar más rápido" (eso lo hace cualquier TPV).

El pipeline completo existe y es único en este segmento:

```
extracto bancario → clasificación determinista → caja vs económico → semáforo
   → sueldo posible (lib/treasury/scenarios.ts)
carta + escandallos → coste por producto → margen real por venta
   → "estos 3 productos te pierden dinero" (lib/profitability/insights)
```

## Dónde está el valor (ranking)

1. **Treasury / extracto→sueldo** — nadie más se lo da a una cafetería de 1-3
   personas por 29 €. Es el gancho del folleto y ya existe (motor validado con
   los datos reales de Raíz). **Riesgo**: nunca procesó un extracto de un banco
   ajeno (AUDIT previo §7) — los formatos CSV/XLS de cada banco español son el
   verdadero enemigo.
2. **Escandallos→margen honesto** — "sin coste no se inventa margen" está
   implementado (hub honesto en vacío, `c355f08`). Diferenciador de confianza.
3. **TPV multi-tenant** — es la fuente de datos de (2), no el producto. Venderlo
   como "TPV" sería competir con Square/SumUp con menos features.
4. **Comunidad** — retención futura; correcto tenerla, no es argumento de venta hoy.
5. **Loyalty/gamificación** — valor probado solo en Raíz (campus). NO es Enverde.

## Qué es confuso (visto desde un dueño de café)

- **Dos paneles**: hub `/org/[orgId]` (diagnóstico) + secciones legacy `/?section=`
  (operación). Es decisión consciente (AUDIT previo §10) con nav curada, pero
  para un usuario nuevo "dónde estoy" es la primera pregunta. Vigilar en la
  sesión guiada; no tocar antes.
- **Tres dominios en el viaje**: enverde.app (funnel) → app.enverde.app (panel)
  → pos.raizygrano.com (TPV). El TPV bajo marca Raíz para un café ajeno es raro
  (el header ya se rebrandea 🌱, pero el dominio no). Barato de arreglar con un
  dominio pos.enverde.app apuntando al mismo proyecto Vercel — decisión de marca, no de código.
- **Vocabulario**: "escandallo" es correcto en hostelería ES, mantener; "Panel de
  Verdad", "Lectura rápida" — bien. "Magic inventory" (POS) es la excepción anglo.

## Para un MVP vendible: sobra / falta

**Sobra (para Enverde, no borrar — ya está gateado por marca):** gamificación
completa, combos profes, teacher-orders, control-tower, bonos, PWA cliente.
El gate `brand.key === "raiz"` ya hace este trabajo. Correcto.

**Falta (en orden):**
1. **Validación humana** — el gap número 1, ya identificado en el audit previo,
   sigue abierto 3 semanas después: ninguna cafetería real ha usado esto sin
   acompañamiento.
2. **Robustez del import bancario** — soportar los 4-5 formatos de los bancos
   donde estén los pilotos (BBVA/Santander ya sembrados en `seed-accounts.ts`;
   CaixaBank/Sabadell/ING no hay evidencia).
3. **Onboarding autónomo** — la checklist "Puesta a punto" existe; falta saber
   si alguien la termina solo (métrica, no feature).
4. NO faltan features nuevas. El feature freeze es correcto — respetarlo.

## Vender / regalar

Ya decidido y coherente con el código: **gratis primero** (giro 2026-06-08,
funnel "Registrarse gratis"), tiers Esencial 29 € / Pro 59 € / Suite 149 €.
El cupo IA free (`ENVERDE_FREE_AI_CALLS_PER_MONTH`) + BYOK ya limitan el coste
marginal del free tier. Lo regalable es exactamente lo que hay: hub + treasury
+ escandallos + TPV. Lo cobrable (Pro): bonos per-café (runbook aparcado — bien
aparcado), más IA, benchmark colectivo (futuro, opt-in).

## Diferencia frente a un POS tradicional (para la demo)

| POS tradicional | Enverde |
|---|---|
| Te dice cuánto vendiste | Te dice cuánto **ganaste** y si puedes pagarte sueldo |
| El margen lo calculas tú en Excel | Escandallo → margen por producto, marcado como estimado si lo es |
| El banco es otra pestaña | El extracto ES el input principal |
| Datos del mes | Semáforo caja vs económico (devengos, estacionalidad) |

**Guion de demo (5 min)**: subir extracto demo → semáforo + "sueldo posible X €"
→ abrir Márgenes → "estos productos no tienen coste" → vincular un escandallo →
el margen aparece marcado honesto → checklist como mapa de "qué me falta".
(Todo esto ya existe; `api/demo/treasury-snapshot` sirve la demo del funnel.)

## Métrica primero

**Activación del piloto**: % de cafés que en 7 días suben 1 extracto real **y**
crean/vinculan 1 escandallo. Ya hay instrumentación: `/internal/pilot` +
`orgs/{org}/events`. No inventar más métricas hasta tener esa.
