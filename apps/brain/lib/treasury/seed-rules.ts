/**
 * lib/treasury/seed-rules.ts
 *
 * Reglas semilla del Treasury Truth Layer.
 *
 * Cada regla tiene un id estable `seed_*` para que el seeding sea idempotente.
 * Si el usuario edita una regla manualmente desde la UI futura, su `source`
 * pasa a `"manual"` y deja de sobrescribirse en upgrades de seed.
 *
 * Prioridades (mayor = se evalúa primero):
 *   200  ventas TPV
 *   190  traspasos internos + barrido TPV Santander→BBVA
 *   180  AEAT, Seguridad Social
 *   160  disposición socio (Geremi / administrador) — gana a nómina
 *   150  proveedores específicos (café, IA, gestoría, zumos, packaging, UFV)
 *   145  nómina, telefonía, Apple, açaí, web/hosting
 *   140  comisiones banco, café genérico
 *   135  gastos personales del socio (gimnasio, joyería…)
 *   130  proveedores genéricos (Amazon, Makro, IKEA/ECI), Decathlon
 *   125  combustible / gasolineras
 *   120  transporte
 *   115  supermercados (materia prima, confidence baja)
 *   112  cuota bono / recobro / liquidación tarjeta
 *   110  tarjetas pendientes (9415, 2288)
 *   100  retiradas socio
 */

import type { TreasuryRule } from "./types";

export const SEED_RULES: TreasuryRule[] = [
  /* ─── Ingresos TPV ──────────────────────────────────────────── */
  {
    id: "seed_tpv_redsys",
    name: "TPV / Redsys / liquidación tarjeta (multi-formato)",
    priority: 200,
    version: 3,
    active: true,
    amountSign: "positive",
    matchers: [
      {
        field: "concept",
        // v3 (PR1.4): añadido "Liquidacion Efectuada" — formato Santander
        // cuenta principal ("Liquidacion Efectuada El X A Raiz Y Grano …").
        // BBVA mete "COMERC <id> REM <ref>" (v2). Otros bancos pueden usar
        // "REDSYS", "TPV", "comercio santander", "abono comercio".
        regex:
          "\\bredsys\\b" +
          "|\\btpv\\b" +
          "|liquidaci[oó]n\\s+tarjeta" +
          "|liquidaci[oó]n\\s+efectuada" +
          "|liquid\\.?\\s*tarjetas?" +
          "|comercio\\s+santander" +
          "|abono\\s+comercio" +
          "|abono\\s+tpv" +
          "|liquidaci[oó]n\\s+comercio" +
          "|\\bcomerc\\s+\\d{6,}\\b",
      },
    ],
    action: {
      category: "ventas_tpv",
      subcategory: "tpv",
      flowKind: "income_sales_tpv",
      supplierName: "TPV / Redsys",
      confidence: 0.95,
    },
    source: "seed",
    notes:
      "Liquidaciones diarias del datáfono — ingreso operativo principal. " +
      "BBVA: 'COMERC <id> REM <ref>'. Santander: 'Liquidacion Efectuada El X A …'.",
  },

  /* ─── Impuestos / cotizaciones ──────────────────────────────── */
  {
    id: "seed_aeat",
    name: "AEAT / Agencia Tributaria (NRC + cargo de impuestos + embargo)",
    priority: 180,
    version: 4,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // v2 (PR1.1): patrón NRC — pagos a Hacienda en BBVA como "NRC. <ref>".
        // v3 (2026-06): "CARGO POR PAGO DE IMPUESTOS - TRIBUTOS" (BBVA código
        // 00326) cuando la referencia NO trae el prefijo "NRC." en el concepto.
        regex:
          "\\baeat\\b|agencia\\s+tributaria|hacienda\\s+p[uú]blica|\\bnrc[\\s.]" +
          "|cargo\\s+por\\s+pago\\s+de\\s+impuestos|pago\\s+de\\s+(impuestos|tributos)" +
          // v4 (2026-06): embargos de la AEAT — "EMBARGO282…E DELEGACIÓN …
          // HACIENDA" (BBVA, sin espacio tras "embargo") y "Adeudo Embargo
          // Estatal Admon. Tributaria (aeat)" (Santander). Sin \b tras "embargo".
          "|embargo.{0,60}(hacienda|tributaria|aeat|estatal)|embargo\\s+estatal",
      },
    ],
    action: {
      category: "impuestos",
      subcategory: "aeat",
      flowKind: "expense_operating",
      supplierName: "AEAT",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "NRC = Número de Referencia Completo, identifica pagos a la AEAT en el concepto bancario. Incluye embargos de Hacienda (v4).",
  },
  {
    id: "seed_seguridad_social",
    name: "Seguridad Social / TGSS / Cuota autónomo",
    priority: 180,
    version: 2,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // v2 (PR1.5): añadido "cuota autonomo" — formato manual que el banco
        // muestra cuando se domicilia bajo concepto libre.
        keywordsAny: [
          "seguridad social",
          "tgss",
          "t.g.s.s",
          "tesoreria gral",
          "tesorería gral",
          "tesoreria general seg",
          "tesorería general seg",
          "cuota autonomo",
          "cuota autónomo",
          "pago cuota autonomo",
          "pago cuota autónomo",
        ],
      },
    ],
    action: {
      category: "personal",
      subcategory: "autonomo_ss",
      flowKind: "expense_operating",
      supplierName: "Seguridad Social",
      confidence: 0.95,
    },
    source: "seed",
  },

  /* ─── Comisiones / gastos del propio banco (v1, 2026-06) ────── */
  {
    id: "seed_bank_fees",
    name: "Comisiones y gastos bancarios",
    priority: 140,
    version: 2,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // Cargos del banco, NO de un proveedor. Frases distintivas para no
        // colisionar con "Liquidacion Efectuada" (TPV, priority 200, positivo).
        regex:
          "tarifa\\s+plana" +
          "|liquidaci[oó]n\\s+de\\s+intereses" +
          "|intereses[\\s-]+comisiones" +
          "|comisiones[\\s-]+gastos" +
          "|liquidaci[oó]n\\s+del\\s+contrato" +
          "|regularizaci[oó]n\\s+cuenta\\s+de\\s+incidencias" +
          "|comisi[oó]n\\s+(de\\s+)?mantenimiento" +
          "|mantenimiento\\s+(de\\s+)?cuenta" +
          // v2: comisión por traspaso de disponible de la tarjeta de crédito
          // (cargo del banco, NO el traspaso interno en sí).
          "|comisi[oó]n\\s+traspaso",
      },
    ],
    action: {
      category: "servicios",
      subcategory: "comisiones_bancarias",
      flowKind: "expense_operating",
      supplierName: "Comisión bancaria",
      confidence: 0.85,
    },
    source: "seed",
    notes:
      "Comisiones, tarifas y gastos que cobra el propio banco (tarifa plana, " +
      "intereses-comisiones-gastos, liquidación del contrato, regularización de " +
      "incidencias, mantenimiento). Gasto operativo inequívoco — no es proveedor.",
  },

  /* ─── Proveedores específicos ───────────────────────────────── */
  {
    id: "seed_amor_perfecto",
    name: "Amor Perfecto (café)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["amor perfecto", "amorperfecto"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "cafe",
      flowKind: "expense_operating",
      supplierName: "Amor Perfecto",
      confidence: 0.95,
    },
    source: "seed",
  },
  {
    id: "seed_ufv",
    name: "UFV / Fundación Francisco de Vitoria (luz / gas)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        regex:
          "(francisco\\s+de\\s+vitoria|fund\\.?\\s*fco\\.?\\s*(de\\s+)?vitoria|\\bufv\\b)",
      },
    ],
    action: {
      category: "suministros",
      subcategory: "luz_gas",
      flowKind: "expense_operating",
      supplierName: "UFV / Fundación Francisco de Vitoria",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "Por defecto la UFV emite suministros básicos del campus (luz/gas). Revisar si en algún mes incluye alquiler o servicios distintos.",
  },
  {
    id: "seed_anthropic",
    name: "Anthropic / Claude (IA)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["anthropic", "claude.ai", "claude ai"],
      },
    ],
    action: {
      category: "tecnologia",
      subcategory: "ia",
      flowKind: "expense_operating",
      supplierName: "Anthropic",
      confidence: 0.95,
    },
    source: "seed",
  },
  {
    id: "seed_openai",
    name: "OpenAI / ChatGPT (IA)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["openai", "chatgpt"],
      },
    ],
    action: {
      category: "tecnologia",
      subcategory: "ia",
      flowKind: "expense_operating",
      supplierName: "OpenAI",
      confidence: 0.95,
    },
    source: "seed",
  },
  {
    id: "seed_zumit",
    name: "Zumit / Squeeze (zumos reventa)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["zumit", "squeeze", "squezze"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "zumos_reventa",
      flowKind: "expense_operating",
      supplierName: "Zumit / Squeeze",
      confidence: 0.9,
    },
    source: "seed",
  },
  {
    id: "seed_reimpulsa",
    name: "Reimpulsa (gestoría)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["reimpulsa"],
      },
    ],
    action: {
      category: "servicios",
      subcategory: "gestoria",
      flowKind: "expense_operating",
      supplierName: "Reimpulsa",
      confidence: 0.95,
    },
    source: "seed",
  },
  {
    id: "seed_envapro_gloop",
    name: "Envapro / Gloop (packaging consumibles)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["envapro", "gloop"],
      },
    ],
    action: {
      category: "packaging",
      subcategory: "consumibles",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
  },

  /* ─── Personal / nóminas (v1, PR1.5) ────────────────────────── */
  {
    id: "seed_nomina",
    name: "Nómina personal",
    priority: 145,
    version: 2,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // v2: añadido "sueldo" (p. ej. "Sueldo lucia abril"). Las nóminas/sueldos
        // del ADMINISTRADOR (Geremi) las captura antes seed_partner_geremi (160).
        regex: "\\bn[oó]mina\\b|\\bsalario\\b|\\bsueldo\\b|\\bpaga\\s+extra\\b",
      },
    ],
    action: {
      category: "personal",
      subcategory: "nomina",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
    notes:
      "Marca economicMonth manualmente a 'mes nominal de la nómina' (no el mes de pago) para que el devengo cuadre.",
  },

  /* ─── Seguros (v1, PR1.5) ───────────────────────────────────── */
  {
    id: "seed_seguros",
    name: "Seguros (Generali, mutua, prevención riesgos)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "generali",
          "mapfre",
          "axa seguros",
          "allianz",
          "mutua",
          "general risk prevention",
          "seguros y reaseguros",
        ],
      },
    ],
    action: {
      category: "seguros",
      subcategory: "general",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
    notes: "Seguros de RC, mutua de prevención, etc.",
  },

  /* ─── Telefonía / internet (v1, PR1.5) ──────────────────────── */
  {
    id: "seed_telefonia",
    name: "Telefonía / Internet (DIGI, Movistar, Vodafone…)",
    priority: 145,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "digi spain",
          "digi mobil",
          "movistar",
          "vodafone",
          "orange esp",
          "masmovil",
          "yoigo",
          "pepephone",
          "lowi",
          "o2 telefonia",
        ],
      },
    ],
    action: {
      category: "suministros",
      subcategory: "telefonia_internet",
      flowKind: "expense_operating",
      confidence: 0.9,
    },
    source: "seed",
  },

  /* ─── Apple subscriptions (v1, PR1.5) ───────────────────────── */
  {
    id: "seed_apple",
    name: "Apple iCloud / App Store / iTunes",
    priority: 145,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        regex: "apple\\.com\\/bill|itunes\\.com|apple\\s*itunes|apple\\s*store",
      },
    ],
    action: {
      category: "tecnologia",
      subcategory: "apple_subscriptions",
      flowKind: "expense_operating",
      supplierName: "Apple",
      confidence: 0.9,
    },
    source: "seed",
    notes: "Suscripciones Apple recurrentes (iCloud, Apple One, etc.).",
  },

  /* ─── Café genérico / proveedores con typo (v1, PR1.5) ───────── */
  {
    id: "seed_cafe_generic",
    name: "Café (proveedor genérico, typos)",
    priority: 140,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "proveedor cafe",
          "proveedor café",
          "provedor cafe",
          "provedor café",
          "tostadores",
          "torrefacto",
          "cervcoffee",
        ],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "cafe",
      flowKind: "expense_operating",
      confidence: 0.8,
    },
    source: "seed",
    notes:
      "Captura proveedores de café que no son Amor Perfecto (la regla específica gana por mayor priority).",
  },

  /* ─── Proveedor de açaí (v1, PR1.5) ─────────────────────────── */
  {
    id: "seed_acai",
    name: "Proveedor de açaí",
    priority: 145,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["acai", "açai", "almalibre acai"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "acai",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
  },

  /* ─── Proveedores genéricos ─────────────────────────────────── */
  {
    id: "seed_amazon",
    name: "Amazon (leche / suministros)",
    priority: 130,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["amazon", "amzn", "amazon.es", "amazon eu"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "leche_suministros_amazon",
      flowKind: "expense_operating",
      supplierName: "Amazon",
      confidence: 0.8,
    },
    source: "seed",
    notes:
      "Por defecto Amazon = leche/suministros operativos. Si una factura concreta es equipamiento, corregir manualmente y el sistema aprenderá.",
  },
  {
    id: "seed_makro",
    name: "Makro (compras generales)",
    priority: 130,
    version: 2,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // v2: "markro" — el banco lo escribe con R extra ("61 MARKRO ALCORCON").
        keywordsAny: ["makro", "markro"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "compras_generales",
      flowKind: "expense_operating",
      supplierName: "Makro",
      confidence: 0.8,
    },
    source: "seed",
  },
  {
    id: "seed_ikea_eci",
    name: "IKEA / El Corte Inglés (equipamiento — revisar)",
    priority: 130,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "ikea",
          "el corte ingles",
          "el corte inglés",
          "corte ingles",
          "corte inglés",
        ],
      },
    ],
    action: {
      category: "equipamiento",
      subcategory: "revisar",
      flowKind: "expense_operating",
      confidence: 0.7,
    },
    source: "seed",
    notes:
      "Confidence baja a propósito: puede ser menaje, mobiliario o consumible. Revisar uno por uno.",
  },

  /* ─── Transporte ────────────────────────────────────────────── */
  {
    id: "seed_transport",
    name: "Uber / Bolt / Cabify (transporte)",
    priority: 120,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        regex: "\\buber\\b|\\bubr\\b|\\bbolt\\b|cabify",
      },
    ],
    action: {
      category: "logistica",
      subcategory: "transporte",
      flowKind: "expense_operating",
      confidence: 0.8,
    },
    source: "seed",
    notes:
      "Revisar deducibilidad: trayectos personales no son gasto del negocio.",
  },

  /* ─── Tarjetas pendientes de extracto detallado ─────────────── */
  {
    id: "seed_card_9415",
    name: "Tarjeta *9415 (pendiente extracto)",
    priority: 110,
    version: 2,
    active: true,
    // v2 (PR1.1): "any" porque las devoluciones (importe positivo) sobre la
    // misma tarjeta también son card_pending hasta que se suba el extracto.
    amountSign: "any",
    matchers: [
      {
        field: "concept",
        // v2: añadido `\b\d{12}9415\b` — BBVA muestra liquidaciones de tarjeta
        // como el PAN completo de 16 dígitos sin la palabra "TARJETA".
        regex:
          "\\b\\d{12}9415\\b|tarjeta.{0,20}9415|\\*\\s*9415|x{2,}\\s*9415",
      },
    ],
    action: {
      category: "tarjeta_pendiente",
      subcategory: "tarjeta_9415",
      flowKind: "card_pending",
      supplierName: "Tarjeta *9415",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "NO se imputa como gasto operativo definitivo. Pendiente subir extracto detallado de la tarjeta para desglose real.",
  },
  {
    id: "seed_card_2288",
    name: "Tarjeta *2288 (pendiente extracto)",
    priority: 110,
    version: 2,
    active: true,
    amountSign: "any",
    matchers: [
      {
        field: "concept",
        regex:
          "\\b\\d{12}2288\\b|tarjeta.{0,20}2288|\\*\\s*2288|x{2,}\\s*2288",
      },
    ],
    action: {
      category: "tarjeta_pendiente",
      subcategory: "tarjeta_2288",
      flowKind: "card_pending",
      supplierName: "Tarjeta *2288",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "NO se imputa como gasto operativo definitivo. Pendiente subir extracto detallado de la tarjeta para desglose real.",
  },

  /* ─── Retirada socio ────────────────────────────────────────── */
  {
    id: "seed_partner_drawing",
    name: "Retirada cajero / disposición socio",
    priority: 100,
    version: 2,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        // v2: concept_or_supplier — en BBVA "RET. EFECTIVO … EN CAJERO" viene en
        // el Concepto (supplier), no en la observación.
        field: "concept_or_supplier",
        keywordsAny: [
          "retirada",
          "reintegro",
          "cajero",
          "ret. efectivo",
          "disposicion efectivo",
          "disposición efectivo",
          "extraccion cajero",
          "extracción cajero",
        ],
      },
    ],
    action: {
      category: "disposicion_socio",
      subcategory: "retirada_socio",
      flowKind: "partner_drawing",
      supplierName: "Disposición socio",
      confidence: 0.85,
    },
    source: "seed",
    notes:
      "NO es gasto operativo. Es una disposición del socio/propietario. Afecta al sueldo posible, no al P&L.",
  },

  /* ─── Movimientos internos entre cuentas propias (v1, 2026-06) ─ */
  {
    id: "seed_internal_transfer",
    name: "Traspaso interno entre cuentas/tarjetas propias",
    priority: 190,
    version: 1,
    active: true,
    amountSign: "any",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "trasp. cta",
          "trasp.cta",
          "abo. por traspaso",
          "traspaso entre cuentas",
          "traspaso a cuenta",
          "ingreso desde cuenta",
          "recibo mes anterior",
        ],
      },
    ],
    action: {
      category: "traspaso_interno",
      subcategory: "entre_cuentas",
      flowKind: "internal_transfer",
      supplierName: "Traspaso interno",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "Sale de una cuenta propia y entra en otra (cuenta↔tarjeta). NO es ingreso ni gasto — se excluye del resultado.",
  },
  {
    id: "seed_internal_sweep_santander",
    name: "Barrido TPV Santander → cuenta operativa (Eurosirius)",
    priority: 190,
    version: 2,
    active: true,
    // v2: "any" — el barrido tiene DOS patas: la salida de Santander (negativa,
    // "Transferencia … A Favor De Euro Sirius") y la entrada en BBVA (positiva).
    // Ambas son internas. Las ventas TPV reales las captura seed_tpv_redsys (200).
    amountSign: "any",
    matchers: [
      {
        field: "concept_or_supplier",
        // Marcadores INEQUÍVOCOS del barrido entre las cuentas de Eurosirius.
        regex:
          "a\\s+favor\\s+de\\s+euro\\s*sirius" +
          "|euro\\s*sirius" +
          "|enviado\\s+por\\s+banco\\s+santander" +
          "|raiz\\s*y\\s*grano|raizygrano",
      },
    ],
    action: {
      category: "traspaso_interno",
      subcategory: "barrido_tpv",
      flowKind: "internal_transfer",
      supplierName: "Barrido TPV (Santander→BBVA)",
      confidence: 0.85,
    },
    source: "seed",
    notes:
      "Dinero del datáfono Santander movido a la operativa. Ya se contó como venta TPV en su liquidación; aquí es interno para no duplicar ingresos.",
  },
  {
    id: "seed_internal_sweep_freetext",
    name: "Barrido TPV — texto libre 'Ventas/Ingresos/Cobros' (solo entradas)",
    priority: 189,
    version: 1,
    active: true,
    // SOLO positivo: es la ENTRADA del barrido en BBVA, que Geremi describe a
    // mano ("Ventas de la semana", "Ingresos tpv", "Cobros 21/22/23"). En
    // negativo "COBRO …" suele ser un cargo del banco, así que NO se toca.
    amountSign: "positive",
    matchers: [
      {
        field: "concept",
        regex: "^\\s*(ventas?|ingresos?|cobros?)\\b",
      },
    ],
    action: {
      category: "traspaso_interno",
      subcategory: "barrido_tpv",
      flowKind: "internal_transfer",
      supplierName: "Barrido TPV (Santander→BBVA)",
      confidence: 0.8,
    },
    source: "seed",
    notes:
      "Entrada del barrido descrita a mano. Las ventas TPV reales (positivas) las gana seed_tpv_redsys (priority 200) antes que esta regla.",
  },
  {
    id: "seed_partner_geremi",
    name: "Disposición socio — Geremi / administrador",
    priority: 160,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["geremi", "administrador", "contreras contreras"],
      },
    ],
    action: {
      category: "disposicion_socio",
      subcategory: "retirada_socio",
      flowKind: "partner_drawing",
      supplierName: "Disposición socio (Geremi)",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "Transferencias/'nóminas' al administrador (Geremi) = disposición de socio, NO nómina de empleado. Gana a seed_nomina (priority 160 > 145).",
  },
  {
    id: "seed_partner_personal",
    name: "Gastos personales del socio (gimnasio, joyería, bazar…)",
    priority: 135,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "intur esport",
          "twojeys",
          "temu",
          "tan-go",
          "tan go",
          "normal madrid",
          "medias puri",
          "cristina oria",
          "tentenchanclas",
        ],
      },
    ],
    action: {
      category: "disposicion_socio",
      subcategory: "gasto_personal",
      flowKind: "partner_drawing",
      supplierName: "Gasto personal socio",
      confidence: 0.7,
    },
    source: "seed",
    notes:
      "Comercios no operativos (gimnasio recurrente, joyería, bazar, espectáculos) con tarjeta de empresa. Disposición de socio; sácalos de la cuenta del negocio.",
  },
  {
    id: "seed_card_program_fees",
    name: "Cuota bono / recobro / liquidación tarjeta de crédito",
    priority: 112,
    version: 1,
    active: true,
    amountSign: "any",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "cuota bono",
          "liquidacion remesas de tarjetas",
          "liquidación remesas de tarjetas",
          "recobro deuda",
          "adeudo mensual de tarjeta",
        ],
      },
    ],
    action: {
      category: "tarjeta_pendiente",
      subcategory: "programa_tarjeta",
      flowKind: "card_pending",
      supplierName: "Tarjeta de crédito",
      confidence: 0.85,
    },
    source: "seed",
    notes:
      "Liquidación en bloque / cuota / recobro de la tarjeta de crédito. NO se imputa como gasto hasta desglosar el extracto detallado.",
  },
  {
    id: "seed_cafe_ask",
    name: "Café — facturas ASK (proveedor de la casa)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // El proveedor de café numera sus facturas "ASK133 / ASK152 / ASKRC5".
        // A veces el concepto es solo el código, sin "proveedor café".
        regex: "\\bask(rc)?\\s*\\d",
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "cafe",
      flowKind: "expense_operating",
      supplierName: "Proveedor café (ASK)",
      confidence: 0.8,
    },
    source: "seed",
    notes:
      "Códigos de factura ASK### del proveedor de café. Confírmame el nombre real del proveedor para nombrarlo bien.",
  },
  {
    id: "seed_decathlon",
    name: "Decathlon (equipamiento / inmovilizado)",
    priority: 130,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [{ field: "concept_or_supplier", keywordsAny: ["decathlon"] }],
    action: {
      category: "equipamiento",
      subcategory: "inmovilizado",
      flowKind: "expense_operating",
      supplierName: "Decathlon",
      confidence: 0.75,
    },
    source: "seed",
    notes:
      "Compra de equipo/inmovilizado, no consumo del mes. (Hoy el agregador la mete en otrosGastos; pendiente capitalizar+amortizar si supera el umbral de inmovilizado.)",
  },
  {
    id: "seed_combustible",
    name: "Gasolineras / combustible",
    priority: 125,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "ballenoil",
          "petroprix",
          "repsol",
          "cepsa",
          "galp",
          "gasolinera",
          "carburante",
          "estacion de servicio",
          "estación de servicio",
        ],
      },
    ],
    action: {
      category: "logistica",
      subcategory: "combustible",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
  },
  {
    id: "seed_web_hosting",
    name: "Dominios / hosting / software web",
    priority: 145,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "dondominio",
          "piensasolutions",
          "eventppt",
          "ovh",
          "godaddy",
          "hostinger",
          "ionos",
          "namecheap",
          "vercel",
          "cloudflare",
        ],
      },
    ],
    action: {
      category: "tecnologia",
      subcategory: "web_hosting",
      flowKind: "expense_operating",
      confidence: 0.9,
    },
    source: "seed",
  },
  // NOTA: supermercados y restauración se dejan a propósito SIN regla → caen en
  // needs_review. Es una decisión de producto (ver classify.smoke.mjs): pueden
  // ser gasto personal, así que el sistema PREGUNTA en vez de adivinar.
];

/**
 * Reglas específicas de la CASA (Raíz y Grano): proveedores y tarjetas propios.
 *
 * NO deben sembrarse en cafés cliente — contaminarían su clasificación. El caso
 * grave son las tarjetas: un PAN ajeno acabado en 9415/2288 entraría como
 * "tarjeta pendiente" y falsearía su P&L y el sueldo posible. Los nombres de
 * proveedor (Amor Perfecto, UFV, Zumit, Reimpulsa, Envapro/Gloop) además
 * ensucian su lista de reglas con vendors que no conocen.
 *
 * Solo la org canónica (la que NO nace del funnel enverde) recibe este set.
 * Ver `bootstrapTreasury` en store.ts.
 */
const OWNER_RULE_IDS = new Set<string>([
  "seed_amor_perfecto",
  "seed_ufv",
  "seed_zumit",
  "seed_reimpulsa",
  "seed_envapro_gloop",
  "seed_card_9415",
  "seed_card_2288",
  // 2026-06: específicas de Eurosirius/Raíz y Grano
  "seed_internal_sweep_santander", // barrido TPV Santander→BBVA (asume su flujo)
  "seed_internal_sweep_freetext", // "Ventas/Ingresos/Cobros" = barrido (su flujo)
  "seed_partner_geremi", // el administrador es Geremi en concreto
  "seed_partner_personal", // comercios personales del socio
  "seed_card_program_fees", // cuota bono / recobro de SUS tarjetas
  "seed_cafe_ask", // códigos de factura ASK### de su proveedor de café
  "seed_dietas_restauracion", // restaurantes concretos donde consume el socio
]);

/** Reglas universales para cualquier cafetería española — seguras de sembrar. */
export const GENERIC_SEED_RULES: TreasuryRule[] = SEED_RULES.filter(
  (r) => !OWNER_RULE_IDS.has(r.id)
);

/** Reglas propias de Raíz y Grano — solo para la org de la casa. */
export const OWNER_SEED_RULES: TreasuryRule[] = SEED_RULES.filter((r) =>
  OWNER_RULE_IDS.has(r.id)
);

/** Versión global del ruleset semilla — útil para invalidar caché futura. */
export const SEED_RULES_VERSION = 7;
