# 08 · Decisiones estratégicas (las tuyas, no las mías)

> Cosas que ningún auditor puede decidir por ti. Para cada una: el trade-off
> real y mi recomendación como CTO externo. Varias ya tienen decisión previa
> registrada (AGENT_DECISIONS) — las marco; decidir es también re-confirmarlas.

## D1 · ¿Raíz y Grano y Enverde siguen siendo UN sistema?

Hoy: un repo, un Firebase, separación "blanda" por tenant+marca (docs/RAIZ-VS-ENVERDE.md).
- **Mantener junto** (recomendado ahora): velocidad máxima, un solo deploy
  mental, Raíz es el mejor banco de pruebas de Enverde.
- **Separar**: obligatorio solo si (a) Enverde levanta inversión/socios, (b) un
  cliente exige aislamiento de datos duro, o (c) vendes/cierras la cafetería.
- **Decisión latente que nadie ha escrito**: si Enverde funciona, ¿Raíz se
  convierte en "la org demo" o sigue siendo un negocio con roadmap propio
  (loyalty, bonos)? Cada hora en gamificación Raíz es una hora no-Enverde.

## D2 · ¿El TPV es parte del producto Enverde o un accesorio?

El valor CFO funciona con extracto+escandallos aunque el café use OTRO TPV
(ventas manuales ya existen: `api/org/[orgId]/manual-sales`). Empujar tu TPV
multiplica el soporte (hardware, impresoras, red del local…).
- **Recomendación**: en el piloto, TPV = opcional ("si no tienes ninguno").
  Medir cuántos pilotos lo adoptan antes de invertir un euro más en él.
  Corolario: la integración con TPVs ajenos (import CSV de Square/SumUp) puede
  valer más que mejorar el propio.
- **✅ DECIDIDO (2026-07-03): TPV incluido gratis como accesorio.** El coste
  variable monetario es ~0 (Vercel es fijo por proyecto; Firestore de un café
  son céntimos/mes; la IA está capada por org y el TPV no usa IA). El coste
  real es doble: (a) tiempo de soporte — límite explícito: software sí,
  hardware no (impresoras, cajones, tablets los pone el café); (b) **promesa
  implícita de disponibilidad**: si un café cobra con TU TPV, una caída le
  bloquea la caja — por eso se ofrece como "si no tienes ninguno", nunca se
  empuja como reemplazo del TPV que ya les funciona.

## D3 · ¿Quién opera esto cuando haya 10 cafés? (la pregunta incómoda)

Hoy la operación = 29 scripts CLI (`apps/brain/scripts/`) ejecutados por ti en
este Mac con la key admin. Con 10 cafés reales: ¿quién resube un extracto
fallido un domingo? ¿qué SLA implícito estás prometiendo al cobrar 29 €?
- **Recomendación**: definir por escrito el "manual de operación del piloto"
  (qué haces tú a mano, qué se auto-sirve el café) ANTES de las 10. No es
  código, es una página. Y decidir cuánto de los scripts CLI debe convertirse
  en UI de `/internal/` antes de escalar.
- **✅ DECIDIDO (2026-07-03): modelo de operación del piloto** (con 30h/semana, D7):
  1. **Manual de operación de 1 página**: qué se auto-sirve el café / qué haces
     tú a mano / qué NO se soporta (hardware).
  2. **Onboarding proactivo, no soporte reactivo**: sesión agendada de 20-30 min
     por café al activarse (10 cafés = ~5h una vez, no deuda permanente).
  3. **Un solo canal de soporte** (WhatsApp Business) con expectativa escrita:
     respuesta <24h laborables. Sin promesa de urgencias — nada del producto
     free es misión-crítica salvo el TPV (ver D2).
  4. **Alertas de fallo de extracto** (hoy un `treasury/extract` que falla es
     silencioso hasta que el café se queja): notificación simple al fallar para
     una org real. Backlog P2 — es operación, no feature.
  5. **Regla de 3**: script CLI ejecutado 3+ veces para cafés del piloto →
     promoverlo a UI de `/internal/`. Antes de la 3ª vez, no automatizar.
  6. **Ritual semanal fijo** (lunes, 45 min): `/internal/pilot` + `orgs/{org}/events`
     + elegir 1 café al que llamar. Log de cada intervención manual — ese log
     ES el backlog de automatización real.
  7. **Presupuesto de operación: 5h/semana.** Si 10 cafés lo revientan, el
     modelo no escala a 30 y lo sabrás en semanas, no en un año — esa es una
     conclusión valiosa del piloto, no un fracaso.

## D4 · Free-first: ¿cuál es el trigger de cobro?

Ya decidido: gratis + inteligencia colectiva, sin trial (giro 2026-06-08).
Falta la segunda mitad: **qué evento convierte a un café free en Esencial 29 €**.
¿Límite de meses de histórico? ¿de llamadas IA (ya existe el cupo)? ¿bonos?
- **Recomendación**: no decidirlo con teoría; el piloto debe responder "qué
  echan de menos los free". Pero fija YA qué vas a medir para saberlo
  (uso de IA vs cupo, frecuencia de subida de extractos, uso del TPV).
- **✅ DECIDIDO (2026-07-03): el trigger de cobro es valor demostrado** ("que
  vea que funciona y que se ahorra coste"). Operacionalización: el producto
  debe producir un **número de ahorro visible y mensual** — "Enverde te
  encontró X € de margen este mes" (re-precios sugeridos, productos sin coste
  corregidos, sueldo posible que sube de A a B). La conversación de cobro
  ocurre cuando ese número documentado supera claramente los 29 €/mes.
  Durante el piloto: NO se gatea nada; solo se instrumenta (IA vs cupo,
  extractos/mes, escandallos creados, re-precios aplicados). El "informe de
  valor mensual" como feature se decide POST-piloto con esos datos.

## D5 · ¿La comunidad es core o apuesta?

1.622 líneas desplegadas (sin commitear) + secciones en el hub. Foro global
con novedades staff. Con 10 cafés, un foro vacío comunica lo contrario de
"inteligencia colectiva".
- **Recomendación**: mantenerla, pero definir el mínimo editorial (¿1 post
  staff/semana? ¿quién responde preguntas?) o esconderla hasta que haya masa.
  Es una decisión de tu tiempo, no de código.
- **✅ DECIDIDO (2026-07-03): postear seguido.** Compromiso concreto: mínimo
  1 post staff/semana (alternando novedades de producto y tips de rentabilidad),
  preguntas respondidas <48h, presupuesto ~2h/semana. **Antes de enviar
  `/piloto` a las 10: sembrar 3-4 posts** — un foro vacío el día 1 contradice
  la narrativa de inteligencia colectiva.

## D6 · Deploy sin git como norma, ¿hasta cuándo?

El workflow Vercel-CLI-desde-working-tree te dio velocidad y te costó CRIT-2
(prod sin respaldo). Con CI mínimo (P1) puedes mantener el deploy manual PERO
con la regla "no deploy sin commit+push previo".
- **Recomendación**: adoptar esa regla ya; considerar deploy-on-push a main
  solo cuando el CI lleve un mes verde.

## D7 · ¿Cuánto de "Claude Corps" depende de este repo?

Contexto personal: empiezas Ing. de Sistemas de IA (sep-2025→) y tienes CV en
circulación. Si en 6 meses el tiempo cae a 5 h/semana: ¿Enverde en
mantenimiento con 10 cafés free es sostenible? ¿Raíz sin ti operándola?
- **Recomendación**: que el plan del mes (06) asuma explícitamente tu
  disponibilidad real de horas/semana — el backlog P2/P3 se recorta solo con
  ese número delante.
- **✅ DECIDIDO (2026-07-03): 30h/semana.** Reparto propuesto que hace realista
  el plan del mes (06) completo: **15h producto/código** (P0/P1 primero, luego
  P2: parsers bancarios, rate limiting, limpieza) · **8h piloto/ventas**
  (sesión guiada, seguimiento de las 10, llamadas) · **5h operación/soporte**
  (cap de D3) · **2h comunidad** (D5). Con 30h el backlog P2 entra entero en
  el mes; los P3 siguen esperando a tracción, no a horas.

## Ya decidido y que esta auditoría CONFIRMA (no reabrir)

- Feature freeze hasta uso real observado. ✔
- Panel canónico Enverde = brain; marketplace = solo funnel. ✔
- Bonos per-café aparcados hasta café Pro real (runbook escrito). ✔
- No podar los 4 puntos de entrada a "subir extracto" hasta observar uso. ✔
- Firestore rules deploy manual, fuera de Vercel. ✔ (con CI, añadir un check
  de drift rules↔prod como el que ya se hizo a mano el 2026-06-10).
